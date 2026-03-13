import { getIntegrationSettings } from "@/lib/settings";

export interface OcrResult {
  text: string;
  keywords: string[];
  description: string;
}

export class OcrError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OcrError";
  }
}

export async function ocrImage(
  buffer: Buffer,
  mimeType: string,
): Promise<OcrResult> {
  const settings = getIntegrationSettings();
  if (!settings.ocrEnabled) {
    throw new OcrError("OCR 未启用，请在设置中开启。");
  }
  if (!settings.visionModelBaseUrl || !settings.visionModelApiKey || !settings.visionModelName) {
    throw new OcrError("OCR 配置不完整，请在设置中填写 Vision 模型的 URL、API Key 和模型名称。");
  }

  const base64 = buffer.toString("base64");
  const dataUri = `data:${mimeType};base64,${base64}`;
  const apiUrl = settings.visionModelBaseUrl.replace(/\/+$/, "") + "/chat/completions";

  const res = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.visionModelApiKey}`,
    },
    body: JSON.stringify({
      model: settings.visionModelName,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: '请识别图中所有文字并提取关键信息。返回 JSON 格式：{"text": "识别出的全部文字", "keywords": ["关键词1", "关键词2"], "description": "图片内容的简短描述"}。只返回 JSON，不要其他内容。',
            },
            {
              type: "image_url",
              image_url: { url: dataUri },
            },
          ],
        },
      ],
      max_tokens: 2048,
    }),
  });

  if (!res.ok) {
    let detail = "";
    try {
      const errBody = await res.text();
      detail = errBody.slice(0, 300);
    } catch { /* ignore */ }
    throw new OcrError(`Vision API 返回错误 ${res.status}: ${detail || res.statusText}`);
  }

  const data = await res.json();
  const content: string = data.choices?.[0]?.message?.content || "";

  if (!content) {
    throw new OcrError("Vision API 返回了空内容。");
  }

  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return { text: content, keywords: [], description: "" };
  }

  const parsed = JSON.parse(jsonMatch[0]) as Partial<OcrResult>;
  return {
    text: parsed.text || "",
    keywords: Array.isArray(parsed.keywords) ? parsed.keywords : [],
    description: parsed.description || "",
  };
}
