import { getIntegrationSettings } from "@/lib/settings";

export interface OcrResult {
  text: string;
  keywords: string[];
  description: string;
}

export async function ocrImage(
  buffer: Buffer,
  mimeType: string,
): Promise<OcrResult | null> {
  const settings = getIntegrationSettings();
  if (!settings.ocrEnabled) return null;
  if (!settings.visionModelBaseUrl || !settings.visionModelApiKey || !settings.visionModelName) {
    return null;
  }

  const base64 = buffer.toString("base64");
  const dataUri = `data:${mimeType};base64,${base64}`;
  const apiUrl = settings.visionModelBaseUrl.replace(/\/+$/, "") + "/chat/completions";

  try {
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

    if (!res.ok) return null;

    const data = await res.json();
    const content: string = data.choices?.[0]?.message?.content || "";

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
  } catch {
    return null;
  }
}
