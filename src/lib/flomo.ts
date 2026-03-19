import { readStoredUpload } from "@/lib/storage";
import { getIntegrationSettings } from "@/lib/settings";
import type { KnowledgeRecord } from "@/lib/types";

const FLOMO_IMAGE_URLS_LIMIT = 9;

/** 获取记录中图片的可访问 URL（仅 OSS 或可签名时可得；本地存储无公网 URL 则返回空） */
async function getImageUrlsForRecord(
  userId: string,
  record: KnowledgeRecord,
): Promise<string[]> {
  const imageAssets = (record.assets || []).filter((a) => a.mimeType.startsWith("image/"));
  if (imageAssets.length === 0) return [];

  const urls: string[] = [];
  for (const asset of imageAssets.slice(0, FLOMO_IMAGE_URLS_LIMIT)) {
    try {
      const result = await readStoredUpload(asset.storageKey, {}, userId);
      if (result.kind === "redirect" && result.url) {
        urls.push(result.url);
      }
    } catch {
      // 本地存储或读取失败时无 URL，跳过
    }
  }
  return urls;
}

export async function syncRecordToFlomo(
  userId: string,
  record: KnowledgeRecord,
): Promise<{ ok: boolean; message: string }> {
  const settings = await getIntegrationSettings(userId);
  const webhookUrl = (settings.flomoWebhookUrl || "").trim();

  if (!webhookUrl) {
    return { ok: false, message: "未配置 flomo webhook URL，请在设置中配置" };
  }

  const tags = record.keywords.map((kw) => `#${kw}`).join(" ");
  const title = record.title ? `${record.title}\n\n` : "";
  let body = record.contentText || record.extractedText || record.summary || "";

  const imageAssets = (record.assets || []).filter((a) => a.mimeType.startsWith("image/"));
  if (imageAssets.length > 0) {
    const imageParts = imageAssets.map((a) => {
      const lines: string[] = [`📷 [图片] ${a.originalName}`];
      if (a.description?.trim()) lines.push(`描述: ${a.description.trim()}`);
      if (a.ocrText?.trim()) lines.push(`OCR: ${a.ocrText.trim()}`);
      return lines.join("\n");
    });
    body = body ? `${body}\n\n--- 附图 ---\n${imageParts.join("\n\n")}` : `--- 附图 ---\n${imageParts.join("\n\n")}`;
  }

  const content = `${title}${body}${tags ? `\n\n${tags}` : ""}`;

  const imageUrls = await getImageUrlsForRecord(userId, record);
  const payload: { content: string; image_urls?: string[] } = { content };
  if (imageUrls.length > 0) payload.image_urls = imageUrls;

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, message: `flomo 同步失败 (${res.status}): ${text || res.statusText}` };
    }

    const data = await res.json().catch(() => ({}));
    if (data.code === 0 || data.code === undefined) {
      return { ok: true, message: "已同步到 flomo" };
    }
    return { ok: false, message: data.message || "flomo 返回异常" };
  } catch (err) {
    return { ok: false, message: `flomo 同步请求失败: ${err instanceof Error ? err.message : "网络错误"}` };
  }
}

export async function testFlomoWebhook(webhookUrl: string): Promise<{ ok: boolean; message: string }> {
  const url = webhookUrl.trim();
  if (!url) {
    return { ok: false, message: "请先填写 Webhook URL" };
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: "AI 信迹连通性测试 — 如果你在 flomo 看到这条笔记，说明 webhook 配置正确。",
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, message: `请求失败 (${res.status}): ${text || res.statusText}` };
    }

    const data = await res.json().catch(() => ({}));
    if (data.code === 0 || data.code === undefined) {
      return { ok: true, message: "测试成功，已发送到 flomo" };
    }
    return { ok: false, message: data.message || "flomo 返回异常" };
  } catch (err) {
    return { ok: false, message: `请求失败: ${err instanceof Error ? err.message : "网络错误"}` };
  }
}
