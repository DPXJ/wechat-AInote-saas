import type { Agent } from "node:http";
import { Client } from "@notionhq/client";
import { HttpsProxyAgent } from "https-proxy-agent";
import nodemailer from "nodemailer";
import { appConfig } from "@/lib/config";
import { addSyncRun, getKnowledgeRecord } from "@/lib/records";
import { getIntegrationSettings } from "@/lib/settings";
import type {
  IntegrationSettings,
  IntegrationStatus,
  KnowledgeRecord,
  NotionSyncPreview,
  SyncTarget,
  TickTickSyncPreview,
} from "@/lib/types";

function normalizeNotionPageId(input: string) {
  const source = input.trim();
  const candidates = source.match(/[0-9a-fA-F]{32}/g);
  const raw = candidates?.at(-1);
  if (!raw) return null;
  return `${raw.slice(0, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}-${raw.slice(16, 20)}-${raw.slice(20)}`;
}

/** 缓存：与浏览器不同，Node 侧请求默认不走系统代理；设置 HTTPS_PROXY 后由 Notion Client 的 agent 出站 */
let notionProxyAgent: Agent | undefined;

function getNotionHttpAgent(): Agent | undefined {
  const url = appConfig.httpsProxy?.trim();
  if (!url) return undefined;
  if (!notionProxyAgent) {
    notionProxyAgent = new HttpsProxyAgent(url) as unknown as Agent;
  }
  return notionProxyAgent;
}

function buildNotionClient(settings: IntegrationSettings) {
  const agent = getNotionHttpAgent();
  return new Client({
    auth: settings.notionToken,
    ...(agent ? { agent } : {}),
  });
}

function createTransporter(settings: IntegrationSettings) {
  const port = Number(settings.smtpPort || "587");
  const isImplicitTLS = port === 465;
  return nodemailer.createTransport({
    host: settings.smtpHost,
    port,
    secure: isImplicitTLS || settings.smtpSecure,
    auth: { user: settings.smtpUser, pass: settings.smtpPass },
    tls: { rejectUnauthorized: false },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000,
  });
}

function requireNotionSettings(settings: IntegrationSettings) {
  if (!settings.notionToken || !settings.notionParentPageId) {
    throw new Error("请先填写 Notion Token 和目标页面地址。");
  }
  const pageId = normalizeNotionPageId(settings.notionParentPageId);
  if (!pageId) throw new Error("Notion 页面地址无效，请填写页面 URL 或 32 位 page id。");
  return pageId;
}

function requireEmailSettings(settings: IntegrationSettings, needTickTick = false) {
  if (!settings.smtpHost || !settings.smtpUser || !settings.smtpPass || !settings.smtpFrom) {
    throw new Error("请先填写完整的 SMTP 参数。");
  }
  if (needTickTick && !settings.tickTickInboxEmail) {
    throw new Error("请先填写滴答清单收件邮箱。");
  }
}

/** 合并 message 与 cause（Node fetch / undici 常见为 TypeError: fetch failed + cause.code） */
function errorDiagnostics(error: unknown): string {
  if (error == null) return "";
  if (error instanceof Error) {
    const parts = [error.message];
    const c = (error as Error & { cause?: unknown }).cause;
    if (c instanceof Error) parts.push(c.message);
    else if (c && typeof c === "object" && "code" in c) parts.push(String((c as { code: unknown }).code));
    else if (typeof c === "string") parts.push(c);
    return parts.join(" ");
  }
  return String(error);
}

function explainIntegrationError(error: unknown) {
  const message = errorDiagnostics(error);
  if (/Could not find page/i.test(message) || /object_not_found/i.test(message))
    return "Notion 页面不存在，或还没有分享给当前 integration。请到该页面的 Share 中把 integration 加进去。";
  if (/unauthorized|forbidden/i.test(message))
    return "Notion Token 没有访问该页面的权限，请检查 integration 权限和页面共享。";
  if (/validation_error/i.test(message))
    return "Notion 页面地址格式不正确，请重新粘贴页面 URL。";
  /** @notionhq/client 走 fetch；仅匹配 fetch failed，避免把 SMTP 的 ETIMEDOUT 等误判成 Notion */
  if (/fetch failed/i.test(message)) {
    const hint =
      /ENOTFOUND|EAI_AGAIN/i.test(message)
        ? "（疑似 DNS 解析失败）"
        : /ETIMEDOUT|UND_ERR_CONNECT_TIMEOUT|Connect Timeout/i.test(message)
          ? "（连接超时）"
          : /ECONNREFUSED|ECONNRESET|ENETUNREACH/i.test(message)
            ? "（连接被拒绝或中断）"
            : /certificate|SSL|TLS|UNABLE_TO_VERIFY/i.test(message)
              ? "（TLS/证书校验问题）"
              : "";
    return (
      `无法连接到 Notion API（网络层）${hint}。` +
      `请确认运行本应用的环境能访问 https://api.notion.com：` +
      `若部署在中国大陆机房，直连常不稳定，需使用海外节点、边缘函数或出站代理；` +
      `本地开发可检查 VPN/防火墙。也可到「设置 → Notion」使用「保存并测试」复现。`
    );
  }
  if (/Invalid login|auth|535/i.test(message))
    return "SMTP 登录失败，请检查邮箱账号、授权码和 SSL/TLS 设置。";
  if (/Greeting never received|ECONNREFUSED|ETIMEDOUT|ENOTFOUND/i.test(message))
    return "SMTP 连接失败：无法连接邮箱服务器。请尝试：(1) 端口 587 不通时改用 465 并勾选 SSL/TLS；(2) 检查网络/VPN 是否允许 SMTP；(3) QQ 邮箱需使用授权码而非登录密码。";
  if (/AccessDenied|InvalidAccessKeyId|SignatureDoesNotMatch/i.test(message))
    return "OSS 鉴权失败，请检查 AccessKey、Bucket、Region 或 Endpoint。";
  return message;
}

function buildRecordBody(record: KnowledgeRecord, limit: number) {
  return [record.contentText, record.extractedText, record.contextNote]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, limit);
}

export function buildNotionSyncPreview(record: KnowledgeRecord): NotionSyncPreview {
  return {
    title: record.title,
    summary: record.summary,
    highlights: [
      `来源：${record.sourceLabel}`,
      `关键词：${record.keywords.join(" / ") || "无"}`,
      `行动项：${record.actionItems.join("；") || "无"}`,
    ],
    body: buildRecordBody(record, 1900),
  };
}

export function buildTickTickSyncPreview(record: KnowledgeRecord): TickTickSyncPreview {
  const subject = record.actionItems[0]
    ? `[AI Box] ${record.actionItems[0]}`
    : `[AI Box] 跟进 ${record.title}`;
  return {
    subject,
    body: [
      `标题：${record.title}`,
      `来源：${record.sourceLabel}`,
      `摘要：${record.summary}`,
      `行动项：${record.actionItems.join("；") || "请人工确认"}`,
      "",
      "原始上下文：",
      buildRecordBody(record, 2500),
    ].join("\n"),
  };
}

export async function getIntegrationStatus(userId: string): Promise<IntegrationStatus> {
  const settings = await getIntegrationSettings(userId);
  const envOss =
    appConfig.storageMode === "oss" &&
    appConfig.ossRegion &&
    appConfig.ossBucket &&
    appConfig.ossAccessKeyId &&
    appConfig.ossAccessKeySecret;
  return {
    storage: {
      configured: Boolean(appConfig.storageMode === "local" || envOss),
      label:
        appConfig.storageMode === "oss"
          ? envOss ? `OSS · ${appConfig.ossBucket}` : "OSS 未完成配置（请在 .env 中填写）"
          : "本地存储",
    },
    notion: {
      configured: Boolean(settings.notionToken && settings.notionParentPageId),
      label: settings.notionParentPageId ? "已填写目标页面" : "未填写目标页面",
    },
    smtp: {
      configured: Boolean(settings.smtpHost && settings.smtpUser && settings.smtpPass && settings.smtpFrom),
      label: settings.smtpHost ? `${settings.smtpHost}:${settings.smtpPort || "587"}` : "未填写 SMTP",
    },
    ticktickEmail: {
      configured: Boolean(settings.tickTickInboxEmail),
      label: settings.tickTickInboxEmail || "未填写滴答邮箱",
    },
  };
}

export async function testNotionConnection(userId: string) {
  const settings = await getIntegrationSettings(userId);
  const pageId = requireNotionSettings(settings);
  try {
    const notion = buildNotionClient(settings);
    const page = await notion.pages.retrieve({ page_id: pageId });
    return { ok: true, pageId, object: page.object, message: "Notion 已连接成功。" };
  } catch (error) {
    throw new Error(explainIntegrationError(error));
  }
}

export async function testSmtpConnection(userId: string) {
  const settings = await getIntegrationSettings(userId);
  requireEmailSettings(settings);
  try {
    const transporter = createTransporter(settings);
    await transporter.verify();
    return { ok: true, message: "SMTP 已连接成功。" };
  } catch (error) {
    throw new Error(explainIntegrationError(error));
  }
}

function toBeijingTimeStr(iso?: string): string {
  const d = new Date(iso || Date.now());
  return d.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false });
}

export async function sendTickTickTestEmail(userId: string) {
  const settings = await getIntegrationSettings(userId);
  requireEmailSettings(settings, true);
  try {
    const transporter = createTransporter(settings);
    const stamp = toBeijingTimeStr();
    const result = await transporter.sendMail({
      from: settings.smtpFrom,
      to: settings.tickTickInboxEmail,
      subject: `[AI 信迹] 滴答邮箱连通性测试 ${stamp}`,
      text: ["这是一封来自 AI 信迹 的测试邮件。", "如果你在滴答清单里看到了新任务，说明邮箱投递链路已经可用。", `时间：${stamp}（北京时间）`].join("\n"),
    });
    return { ok: true, messageId: result.messageId, message: "滴答测试邮件已发送。" };
  } catch (error) {
    throw new Error(explainIntegrationError(error));
  }
}

async function syncToNotion(record: KnowledgeRecord, settings: IntegrationSettings) {
  const pageId = requireNotionSettings(settings);
  try {
    const preview = buildNotionSyncPreview(record);
    const notion = buildNotionClient(settings);
    const response = await notion.pages.create({
      parent: { type: "page_id", page_id: pageId },
      properties: {
        title: { title: [{ type: "text", text: { content: record.title } }] },
      },
      children: [
        {
          object: "block", type: "callout",
          callout: {
            rich_text: [{ type: "text", text: { content: `来源：${record.sourceLabel}` } }],
            icon: { type: "emoji", emoji: "📥" },
            color: "gray_background",
          },
        },
        {
          object: "block", type: "paragraph",
          paragraph: { rich_text: [{ type: "text", text: { content: preview.summary } }] },
        },
        {
          object: "block", type: "bulleted_list_item",
          bulleted_list_item: { rich_text: [{ type: "text", text: { content: preview.highlights[1] } }] },
        },
        {
          object: "block", type: "bulleted_list_item",
          bulleted_list_item: { rich_text: [{ type: "text", text: { content: preview.highlights[2] } }] },
        },
        {
          object: "block", type: "paragraph",
          paragraph: { rich_text: [{ type: "text", text: { content: preview.body || "无正文内容" } }] },
        },
      ],
    });
    return response.id;
  } catch (error) {
    throw new Error(explainIntegrationError(error));
  }
}

async function syncToTickTickEmail(record: KnowledgeRecord, settings: IntegrationSettings) {
  requireEmailSettings(settings, true);
  try {
    const transporter = createTransporter(settings);
    const preview = buildTickTickSyncPreview(record);
    const result = await transporter.sendMail({
      from: settings.smtpFrom,
      to: settings.tickTickInboxEmail,
      subject: preview.subject,
      text: preview.body,
    });
    return result.messageId;
  } catch (error) {
    throw new Error(explainIntegrationError(error));
  }
}

export async function syncRecord(userId: string, recordId: string, target: SyncTarget) {
  const record = await getKnowledgeRecord(userId, recordId);
  if (!record) throw new Error("资料不存在。");

  if (target === "feishu-doc") {
    await addSyncRun(userId, { recordId, target, status: "failed", message: "飞书文档适配器尚未实现。" });
    throw new Error("飞书文档适配器尚未实现。");
  }

  const settings = await getIntegrationSettings(userId);

  try {
    let externalRef: string;
    let syncMessage: string;

    if (target === "flomo") {
      const { syncRecordToFlomo } = await import("@/lib/flomo");
      const result = await syncRecordToFlomo(userId, record);
      if (!result.ok) throw new Error(result.message);
      externalRef = "flomo";
      syncMessage = "已同步到 flomo。";
    } else if (target === "notion") {
      externalRef = await syncToNotion(record, settings);
      syncMessage = "已同步到 Notion。";
    } else {
      externalRef = await syncToTickTickEmail(record, settings);
      syncMessage = "已投递到滴答清单。";
    }

    await addSyncRun(userId, {
      recordId,
      target,
      status: "synced",
      externalRef,
      payload: { title: record.title },
      message: syncMessage,
    });

    return { externalRef };
  } catch (error) {
    const message = error instanceof Error ? error.message : "同步失败。";
    await addSyncRun(userId, { recordId, target, status: "failed", message });
    throw new Error(message);
  }
}
