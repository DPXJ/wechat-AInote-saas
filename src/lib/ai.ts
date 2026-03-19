import OpenAI from "openai";
import { z } from "zod";
import { getIntegrationSettings } from "@/lib/settings";
import type { AnalysisInput, AnalysisOutput, SearchCitation } from "@/lib/types";
import type { AiProvider } from "@/lib/types";
import { tokenize, trimText, unique } from "@/lib/utils";

const analysisSchema = z.object({
  title: z.string().max(30).optional(),
  summary: z.string().min(1),
  keywords: z.array(z.string()).max(8),
  actionItems: z.array(z.string()).max(6),
  suggestedTargets: z
    .array(z.enum(["notion", "ticktick-email", "feishu-doc", "flomo"]))
    .max(3),
});

const PROVIDER_DEFAULTS: Record<
  Exclude<AiProvider, "">,
  { baseURL: string; textModel: string; embeddingModel: string; embeddingSupported: boolean }
> = {
  openai: {
    baseURL: "https://api.openai.com/v1",
    textModel: "gpt-4o-mini",
    embeddingModel: "text-embedding-3-small",
    embeddingSupported: true,
  },
  glm: {
    baseURL: "https://open.bigmodel.cn/api/paas/v4",
    textModel: "glm-4-flash",
    embeddingModel: "embedding-2",
    embeddingSupported: true,
  },
  deepseek: {
    baseURL: "https://api.deepseek.com",
    textModel: "deepseek-chat",
    embeddingModel: "deepseek-embedding",
    embeddingSupported: false,
  },
};

export function isAiConfiguredFromSettings(settings: { aiProvider?: string; aiApiKey?: string }): boolean {
  const p = (settings.aiProvider || "").trim();
  const k = (settings.aiApiKey || "").trim();
  return (p === "openai" || p === "glm" || p === "deepseek") && k.length > 0;
}

async function getAiConfig(userId: string) {
  const settings = await getIntegrationSettings(userId);
  const provider = (settings.aiProvider || "").trim() as AiProvider;
  const apiKey = (settings.aiApiKey || "").trim();
  if (!apiKey || (provider !== "openai" && provider !== "glm" && provider !== "deepseek")) {
    return null;
  }
  const defaults = PROVIDER_DEFAULTS[provider];
  return {
    provider,
    apiKey,
    baseURL: defaults.baseURL,
    textModel: defaults.textModel,
    embeddingModel: defaults.embeddingModel,
    embeddingSupported: defaults.embeddingSupported,
  };
}

function buildOpenAIClient(config: { apiKey: string; baseURL: string }) {
  return new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseURL,
  });
}

function buildFallbackAnalysis(input: AnalysisInput): AnalysisOutput {
  const sourceText = [input.contentText, input.extractedText, input.contextNote]
    .filter(Boolean)
    .join("\n");
  const keywords = unique(tokenize(sourceText)).slice(0, 8);
  const actionHints = sourceText
    .split(/[\n。！？!?\r]+/)
    .map((part) => part.trim())
    .filter((part) =>
      /(待办|跟进|提交|联系|确认|安排|截止|完成|todo|follow up)/i.test(part),
    )
    .slice(0, 4);

  return {
    summary:
      trimText(sourceText, 50) ||
      `已收录一条${input.recordType === "text" ? "文本" : "资料"}信息。`,
    keywords,
    actionItems: actionHints,
    suggestedTargets: actionHints.length > 0 ? ["ticktick-email"] : ["notion"],
  };
}

const SYSTEM_SUMMARY_BASE =
  "你是资料整理助手。请输出 JSON，字段为 title, summary, keywords, actionItems, suggestedTargets。title 不超过 30 字的简洁标题（如原始标题已足够好可省略此字段）；keywords 固定 5 个关键词（仅供搜索索引）；如果内容更偏资料沉淀，suggestedTargets 包含 notion；如果有行动项，包含 ticktick-email。summary 必须是一段纯文本，不要使用反斜杠、不要使用 markdown 或列表符号，30-50 字精炼概括核心要点即可。";

const DEFAULT_SUMMARY_INSTRUCTIONS =
  "摘要（summary）要求：一段 30-50 字的纯文本，精炼概括核心要点，适合搜索回显；不要逐条罗列原文，不要使用反斜杠或换行符。待办项（actionItems）每条需要详细描述：包含具体要做的事情、涉及的人或对象、建议完成时间或截止日期、相关背景信息，描述要清晰完整，方便直接作为待办事项执行，不要过于简略。";

const DEFAULT_TODO_INSTRUCTIONS =
  "提取所有行动项，每条待办需包含：1) 具体要做的事情 2) 涉及的人或对象 3) 建议完成时间或截止日期 4) 相关背景信息。描述要清晰完整，方便直接作为待办事项执行，不要过于简略。";

/** 清洗模型返回的 summary：去掉反斜杠分隔符、多余空白，避免界面显示成 "1、... \ 2、..."。供生成端与展示端复用。 */
export function sanitizeSummary(s: string): string {
  if (!s || typeof s !== "string") return s;
  return s
    .replace(/\\\s*(\d、|[\d]+[.．])/g, " $1")
    .replace(/\\+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export { DEFAULT_SUMMARY_INSTRUCTIONS, DEFAULT_TODO_INSTRUCTIONS };

export async function analyzeRecord(userId: string, input: AnalysisInput): Promise<AnalysisOutput> {
  const config = await getAiConfig(userId);
  if (!config) {
    return buildFallbackAnalysis(input);
  }

  const settings = await getIntegrationSettings(userId);
  const userInstructions = (settings.aiSummaryPrompt || "").trim() || DEFAULT_SUMMARY_INSTRUCTIONS;
  const summaryPrompt = `${SYSTEM_SUMMARY_BASE}\n\n补充要求：${userInstructions}`;

  const client = buildOpenAIClient({ apiKey: config.apiKey, baseURL: config.baseURL });

  const content = [
    `标题: ${input.title}`,
    `来源: ${input.sourceLabel}`,
    `资料类型: ${input.recordType}`,
    input.contextNote ? `补充说明: ${input.contextNote}` : "",
    input.assetNames.length > 0 ? `附件: ${input.assetNames.join(", ")}` : "",
    "正文:",
    input.contentText,
    input.extractedText ? "\n抽取文本:\n" + input.extractedText : "",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const response = await client.chat.completions.create({
      model: config.textModel,
      temperature: 0.2,
      max_tokens: 2048,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: summaryPrompt,
        },
        {
          role: "user",
          content,
        },
      ],
    });

    const raw = response.choices[0]?.message?.content || "{}";
    let parsedJson: unknown = {};
    try {
      parsedJson = JSON.parse(raw);
    } catch {
      return buildFallbackAnalysis(input);
    }

    const parsed = analysisSchema.safeParse(parsedJson);
    if (!parsed.success) {
      return buildFallbackAnalysis(input);
    }
    const out = parsed.data;
    out.summary = sanitizeSummary(out.summary);
    return out;
  } catch {
    return buildFallbackAnalysis(input);
  }
}

export async function createEmbeddings(userId: string, texts: string[]) {
  const config = await getAiConfig(userId);
  if (!config || !config.embeddingSupported || texts.length === 0) {
    return null;
  }

  try {
    const client = buildOpenAIClient({ apiKey: config.apiKey, baseURL: config.baseURL });
    const response = await client.embeddings.create({
      model: config.embeddingModel,
      input: texts,
    });
    return response.data.map((row) => row.embedding);
  } catch {
    return null;
  }
}

export async function answerWithContext(
  userId: string,
  input: {
    question: string;
    citations: SearchCitation[];
    history?: Array<{ role: string; content: string }>;
  },
) {
  const config = await getAiConfig(userId);
  if (!config) {
    const topCitation = input.citations[0];
    if (!topCitation) {
      return "暂时没有命中资料。你可以换个关键词，或者先把相关资料录入收件箱。";
    }
    return `最相关的信息来自《${topCitation.title}》。${topCitation.reason}。上下文摘要：${topCitation.snippet}`;
  }

  const client = buildOpenAIClient({ apiKey: config.apiKey, baseURL: config.baseURL });

  const sourceBlock = input.citations
    .map(
      (citation, index) =>
        `[${index + 1}] 标题: ${citation.title}\n来源: ${citation.sourceLabel}\n命中原因: ${citation.reason}\n片段: ${citation.snippet}`,
    )
    .join("\n\n");

  const historyMessages: Array<{ role: "user" | "assistant"; content: string }> =
    (input.history || [])
      .filter((m) => m.role === "user" || m.role === "assistant")
      .slice(-6)
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    {
      role: "system",
      content:
        "你是企业资料检索助手。根据引用资料回答问题，必须明确提到信息出自哪条资料以及核心上下文；如果证据不足，直接说明。支持多轮对话，参考对话历史保持上下文连贯。",
    },
    ...historyMessages,
    {
      role: "user",
      content: `问题: ${input.question}\n\n资料:\n${sourceBlock}`,
    },
  ];

  try {
    const response = await client.chat.completions.create({
      model: config.textModel,
      temperature: 0.1,
      messages,
    });

    return (
      response.choices[0]?.message?.content?.trim() ||
      "我找到了相关资料，但没有生成稳定回答。"
    );
  } catch {
    return "AI 回答生成失败，请稍后重试。";
  }
}
