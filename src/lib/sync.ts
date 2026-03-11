import OSS from "ali-oss";
import { Client } from "@notionhq/client";
import nodemailer from "nodemailer";
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

  if (!raw) {
    return null;
  }

  return `${raw.slice(0, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}-${raw.slice(
    16,
    20,
  )}-${raw.slice(20)}`;
}

function buildNotionClient(settings: IntegrationSettings) {
  return new Client({ auth: settings.notionToken });
}

function createTransporter(settings: IntegrationSettings) {
  return nodemailer.createTransport({
    host: settings.smtpHost,
    port: Number(settings.smtpPort || "587"),
    secure: settings.smtpSecure,
    auth: {
      user: settings.smtpUser,
      pass: settings.smtpPass,
    },
  });
}

export function createOssClient(settings: IntegrationSettings) {
  return new OSS({
    region: settings.ossRegion,
    endpoint: settings.ossEndpoint || undefined,
    bucket: settings.ossBucket,
    accessKeyId: settings.ossAccessKeyId,
    accessKeySecret: settings.ossAccessKeySecret,
    secure: true,
  });
}

function requireNotionSettings(settings: IntegrationSettings) {
  if (!settings.notionToken || !settings.notionParentPageId) {
    throw new Error("请先填写 Notion Token 和目标页面地址。");
  }

  const pageId = normalizeNotionPageId(settings.notionParentPageId);
  if (!pageId) {
    throw new Error("Notion 页面地址无效，请填写页面 URL 或 32 位 page id。");
  }

  return pageId;
}

function requireEmailSettings(settings: IntegrationSettings, needTickTick = false) {
  if (
    !settings.smtpHost ||
    !settings.smtpUser ||
    !settings.smtpPass ||
    !settings.smtpFrom
  ) {
    throw new Error("请先填写完整的 SMTP 参数。");
  }

  if (needTickTick && !settings.tickTickInboxEmail) {
    throw new Error("请先填写滴答清单收件邮箱。");
  }
}

function hasOssSettings(settings: IntegrationSettings) {
  return Boolean(
    settings.ossRegion &&
      settings.ossBucket &&
      settings.ossAccessKeyId &&
      settings.ossAccessKeySecret,
  );
}

function requireOssSettings(settings: IntegrationSettings) {
  if (!hasOssSettings(settings)) {
    throw new Error("请先填写 OSS 区域、Bucket 和密钥信息。");
  }
}

function explainIntegrationError(error: unknown) {
  const message = error instanceof Error ? error.message : "未知错误";

  if (/Could not find page/i.test(message) || /object_not_found/i.test(message)) {
    return "Notion 页面不存在，或还没有分享给当前 integration。请到该页面的 Share 中把 integration 加进去。";
  }

  if (/unauthorized|forbidden/i.test(message)) {
    return "Notion Token 没有访问该页面的权限，请检查 integration 权限和页面共享。";
  }

  if (/validation_error/i.test(message)) {
    return "Notion 页面地址格式不正确，请重新粘贴页面 URL。";
  }

  if (/fetch failed/i.test(message)) {
    return "连接外部服务时发生网络错误，请确认当前网络可以访问目标服务。";
  }

  if (/Invalid login|auth|535/i.test(message)) {
    return "SMTP 登录失败，请检查邮箱账号、授权码和 SSL/TLS 设置。";
  }

  if (/AccessDenied|InvalidAccessKeyId|SignatureDoesNotMatch/i.test(message)) {
    return "OSS 鉴权失败，请检查 AccessKey、Bucket、Region 或 Endpoint。";
  }

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

export function getIntegrationStatus(): IntegrationStatus {
  const settings = getIntegrationSettings();

  return {
    storage: {
      configured:
        settings.storageMode === "local" ||
        (settings.storageMode === "oss" && hasOssSettings(settings)),
      label:
        settings.storageMode === "oss"
          ? settings.ossBucket
            ? `OSS · ${settings.ossBucket}`
            : "OSS 未完成配置"
          : "本地存储",
    },
    notion: {
      configured: Boolean(settings.notionToken && settings.notionParentPageId),
      label: settings.notionParentPageId ? "已填写目标页面" : "未填写目标页面",
    },
    smtp: {
      configured: Boolean(
        settings.smtpHost &&
          settings.smtpUser &&
          settings.smtpPass &&
          settings.smtpFrom,
      ),
      label: settings.smtpHost
        ? `${settings.smtpHost}:${settings.smtpPort || "587"}`
        : "未填写 SMTP",
    },
    ticktickEmail: {
      configured: Boolean(settings.tickTickInboxEmail),
      label: settings.tickTickInboxEmail || "未填写滴答邮箱",
    },
  };
}

export async function testNotionConnection() {
  const settings = getIntegrationSettings();
  const pageId = requireNotionSettings(settings);

  try {
    const notion = buildNotionClient(settings);
    const page = await notion.pages.retrieve({ page_id: pageId });

    return {
      ok: true,
      pageId,
      object: page.object,
      message: "Notion 已连接成功。",
    };
  } catch (error) {
    throw new Error(explainIntegrationError(error));
  }
}

export async function testSmtpConnection() {
  const settings = getIntegrationSettings();
  requireEmailSettings(settings);

  try {
    const transporter = createTransporter(settings);
    await transporter.verify();

    return {
      ok: true,
      message: "SMTP 已连接成功。",
    };
  } catch (error) {
    throw new Error(explainIntegrationError(error));
  }
}

export async function sendTickTickTestEmail() {
  const settings = getIntegrationSettings();
  requireEmailSettings(settings, true);

  try {
    const transporter = createTransporter(settings);
    const stamp = new Date().toISOString();
    const result = await transporter.sendMail({
      from: settings.smtpFrom,
      to: settings.tickTickInboxEmail,
      subject: `[AI Box 测试] 滴答邮箱连通性 ${stamp}`,
      text: [
        "这是一封来自 AI Box 的测试邮件。",
        "如果你在滴答清单里看到了新任务，说明邮箱投递链路已经可用。",
        `时间：${stamp}`,
      ].join("\n"),
    });

    return {
      ok: true,
      messageId: result.messageId,
      message: "滴答测试邮件已发送。",
    };
  } catch (error) {
    throw new Error(explainIntegrationError(error));
  }
}

export async function testOssConnection() {
  const settings = getIntegrationSettings();
  requireOssSettings(settings);

  try {
    const client = createOssClient(settings);
    const result = await client.listV2({
      prefix: settings.ossPathPrefix || undefined,
      "max-keys": 1,
    });

    return {
      ok: true,
      count: result.keyCount,
      message:
        settings.storageMode === "oss"
          ? "OSS 已连接成功，且当前附件存储模式已切换为 OSS。"
          : "OSS 已连接成功，保存后即可用于附件存储。",
    };
  } catch (error) {
    throw new Error(explainIntegrationError(error));
  }
}

async function syncToNotion(record: KnowledgeRecord) {
  const settings = getIntegrationSettings();
  const pageId = requireNotionSettings(settings);

  try {
    const preview = buildNotionSyncPreview(record);
    const notion = buildNotionClient(settings);
    const response = await notion.pages.create({
      parent: {
        type: "page_id",
        page_id: pageId,
      },
      properties: {
        title: {
          title: [
            {
              type: "text",
              text: {
                content: record.title,
              },
            },
          ],
        },
      },
      children: [
        {
          object: "block",
          type: "callout",
          callout: {
            rich_text: [
              {
                type: "text",
                text: {
                  content: `来源：${record.sourceLabel}`,
                },
              },
            ],
            icon: {
              type: "emoji",
              emoji: "📥",
            },
            color: "gray_background",
          },
        },
        {
          object: "block",
          type: "paragraph",
          paragraph: {
            rich_text: [
              {
                type: "text",
                text: {
                  content: preview.summary,
                },
              },
            ],
          },
        },
        {
          object: "block",
          type: "bulleted_list_item",
          bulleted_list_item: {
            rich_text: [
              {
                type: "text",
                text: {
                  content: preview.highlights[1],
                },
              },
            ],
          },
        },
        {
          object: "block",
          type: "bulleted_list_item",
          bulleted_list_item: {
            rich_text: [
              {
                type: "text",
                text: {
                  content: preview.highlights[2],
                },
              },
            ],
          },
        },
        {
          object: "block",
          type: "paragraph",
          paragraph: {
            rich_text: [
              {
                type: "text",
                text: {
                  content: preview.body || "无正文内容",
                },
              },
            ],
          },
        },
      ],
    });

    return response.id;
  } catch (error) {
    throw new Error(explainIntegrationError(error));
  }
}

async function syncToTickTickEmail(record: KnowledgeRecord) {
  const settings = getIntegrationSettings();
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

export async function syncRecord(recordId: string, target: SyncTarget) {
  const record = getKnowledgeRecord(recordId);
  if (!record) {
    throw new Error("资料不存在。");
  }

  if (target === "feishu-doc") {
    addSyncRun({
      recordId,
      target,
      status: "failed",
      message: "飞书文档适配器尚未实现。",
    });
    throw new Error("飞书文档适配器尚未实现。");
  }

  try {
    const externalRef =
      target === "notion"
        ? await syncToNotion(record)
        : await syncToTickTickEmail(record);

    addSyncRun({
      recordId,
      target,
      status: "synced",
      externalRef,
      payload: { title: record.title },
      message: target === "notion" ? "已同步到 Notion。" : "已投递到滴答清单。",
    });

    return { externalRef };
  } catch (error) {
    const message = error instanceof Error ? error.message : "同步失败。";
    addSyncRun({
      recordId,
      target,
      status: "failed",
      message,
    });
    throw new Error(message);
  }
}
