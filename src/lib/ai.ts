import OpenAI from "openai";
import { z } from "zod";
import { appConfig } from "@/lib/config";
import type { AnalysisInput, AnalysisOutput, SearchCitation } from "@/lib/types";
import { tokenize, trimText, unique } from "@/lib/utils";

const analysisSchema = z.object({
  title: z.string().max(30).optional(),
  summary: z.string().min(1),
  keywords: z.array(z.string()).max(8),
  actionItems: z.array(z.string()).max(6),
  suggestedTargets: z
    .array(z.enum(["notion", "ticktick-email", "feishu-doc"]))
    .max(3),
});

const openaiClient =
  appConfig.openAiApiKey && appConfig.openAiTextModel
    ? new OpenAI({ apiKey: appConfig.openAiApiKey })
    : null;

export function isAiConfigured() {
  return Boolean(
    openaiClient &&
      appConfig.openAiTextModel &&
      appConfig.openAiEmbeddingModel,
  );
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
      trimText(sourceText, 220) ||
      `已收录一条${input.recordType === "text" ? "文本" : "资料"}信息。`,
    keywords,
    actionItems: actionHints,
    suggestedTargets: actionHints.length > 0 ? ["ticktick-email"] : ["notion"],
  };
}

export async function analyzeRecord(input: AnalysisInput): Promise<AnalysisOutput> {
  if (!openaiClient || !appConfig.openAiTextModel) {
    return buildFallbackAnalysis(input);
  }

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

  const response = await openaiClient.chat.completions.create({
    model: appConfig.openAiTextModel,
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "你是资料整理助手。请输出 JSON，字段为 title, summary, keywords, actionItems, suggestedTargets。title 不超过 30 字的简洁标题（如原始标题已足够好可省略此字段）；keywords 固定 5 个关键词；summary 要简洁且适合搜索回显；如果内容更偏资料沉淀，suggestedTargets 包含 notion；如果有行动项，包含 ticktick-email。",
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

  return parsed.data;
}

export async function createEmbeddings(texts: string[]) {
  if (!openaiClient || !appConfig.openAiEmbeddingModel || texts.length === 0) {
    return null;
  }

  const response = await openaiClient.embeddings.create({
    model: appConfig.openAiEmbeddingModel,
    input: texts,
  });

  return response.data.map((row) => row.embedding);
}

export async function answerWithContext(input: {
  question: string;
  citations: SearchCitation[];
  history?: Array<{ role: string; content: string }>;
}) {
  if (!openaiClient || !appConfig.openAiTextModel) {
    const topCitation = input.citations[0];
    if (!topCitation) {
      return "暂时没有命中资料。你可以换个关键词，或者先把相关资料录入收件箱。";
    }

    return `最相关的信息来自《${topCitation.title}》。${topCitation.reason}。上下文摘要：${topCitation.snippet}`;
  }

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

  const response = await openaiClient.chat.completions.create({
    model: appConfig.openAiTextModel,
    temperature: 0.1,
    messages,
  });

  return (
    response.choices[0]?.message?.content?.trim() ||
    "我找到了相关资料，但没有生成稳定回答。"
  );
}
