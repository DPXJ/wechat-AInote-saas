import { getIntegrationSettings } from "@/lib/settings";
import type { KnowledgeRecord } from "@/lib/types";

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
  const body = record.contentText || record.extractedText || record.summary || "";
  const content = `${title}${body}${tags ? `\n\n${tags}` : ""}`;

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
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
