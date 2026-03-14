import { answerWithContext, createEmbeddings, isAiConfigured } from "@/lib/ai";
import { getDb } from "@/lib/db";
import type { SearchCitation, SearchResponse } from "@/lib/types";
import { cosineSimilarity, safeJsonParse, trimText } from "@/lib/utils";

type LexicalMatch = {
  chunk_id: string;
  record_id: string;
  content: string;
  reason: string;
  rank: number;
  title: string;
  source_label: string;
};

type SemanticChunk = {
  id: string;
  record_id: string;
  content: string;
  reason: string;
  embedding: string | null;
  title: string;
  source_label: string;
};

function buildFtsQuery(query: string) {
  return query
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .map((token) => `${token.replace(/["']/g, "")}*`)
    .join(" OR ");
}

export async function searchKnowledge(
  query: string,
  history?: Array<{ role: string; content: string }>,
): Promise<SearchResponse> {
  const trimmed = query.trim();
  if (!trimmed) {
    return {
      answer: "先输入一个问题或者关键词，我再帮你从资料库里找原文和上下文。",
      citations: [],
    };
  }

  const db = getDb();
  let lexicalResults: LexicalMatch[] = [];

  try {
    lexicalResults = db
      .prepare(
        `
          SELECT
            chunks_fts.chunk_id,
            chunks_fts.record_id,
            chunks.content,
            chunks.reason,
            bm25(chunks_fts) AS rank,
            records.title,
            records.source_label
          FROM chunks_fts
          JOIN chunks ON chunks.id = chunks_fts.chunk_id
          JOIN records ON records.id = chunks_fts.record_id
          WHERE chunks_fts MATCH ?
          ORDER BY rank
          LIMIT 8
        `,
      )
      .all(buildFtsQuery(trimmed) || trimmed) as LexicalMatch[];
  } catch {
    lexicalResults = [];
  }

  if (lexicalResults.length === 0) {
    const like = `%${trimmed}%`;
    lexicalResults = db
      .prepare(
        `
          SELECT DISTINCT
            chunks.id AS chunk_id,
            chunks.record_id,
            chunks.content,
            chunks.reason,
            0 AS rank,
            records.title,
            records.source_label
          FROM chunks
          JOIN records ON records.id = chunks.record_id
          LEFT JOIN assets ON assets.record_id = records.id
          WHERE chunks.content LIKE ?
            OR records.title LIKE ?
            OR records.summary LIKE ?
            OR assets.tags LIKE ?
            OR assets.description LIKE ?
            OR assets.ocr_text LIKE ?
          ORDER BY datetime(records.created_at) DESC
          LIMIT 8
        `,
      )
      .all(like, like, like, like, like, like) as LexicalMatch[];
  }

  const merged = new Map<string, SearchCitation>();

  for (const row of lexicalResults) {
    merged.set(row.chunk_id, {
      recordId: row.record_id,
      title: row.title,
      sourceLabel: row.source_label,
      snippet: trimText(row.content, 220),
      reason: row.reason,
      score: Math.abs(Number(row.rank || 0)) + 1,
    });
  }

  type TodoMatch = { id: string; content: string; priority: string; status: string; created_at: string; record_id: string | null };
  const todoLike = `%${trimmed}%`;
  const todoMatches = db
    .prepare(
      `SELECT id, content, priority, status, created_at, record_id FROM todos WHERE content LIKE ? AND status != 'deleted' ORDER BY datetime(created_at) DESC LIMIT 5`,
    )
    .all(todoLike) as TodoMatch[];

  for (const t of todoMatches) {
    const pLabel = { urgent: "紧急", high: "高", medium: "中", low: "低" }[t.priority] || t.priority;
    merged.set(`todo-${t.id}`, {
      recordId: t.record_id || "",
      title: `[待办] ${trimText(t.content, 40)}`,
      sourceLabel: `待办 · ${pLabel} · ${t.status === "done" ? "已完成" : "待进行"}`,
      snippet: t.content,
      reason: "匹配待办事项",
      score: 0.8,
    });
  }

  if (isAiConfigured()) {
    const embeddingRows = db
      .prepare(
        `
          SELECT
            chunks.id,
            chunks.record_id,
            chunks.content,
            chunks.reason,
            chunks.embedding,
            records.title,
            records.source_label
          FROM chunks
          JOIN records ON records.id = chunks.record_id
          WHERE chunks.embedding IS NOT NULL
          ORDER BY datetime(records.created_at) DESC
          LIMIT 80
        `,
      )
      .all() as SemanticChunk[];

    const [queryEmbedding] = (await createEmbeddings([trimmed])) || [];
    if (queryEmbedding) {
      for (const row of embeddingRows) {
        const vector = safeJsonParse<number[]>(row.embedding, []);
        const score = cosineSimilarity(queryEmbedding, vector);
        if (score < 0.42) {
          continue;
        }

        const previous = merged.get(row.id);
        const boosted = score * 10 + (previous?.score || 0);
        merged.set(row.id, {
          recordId: row.record_id,
          title: row.title,
          sourceLabel: row.source_label,
          snippet: trimText(row.content, 220),
          reason: previous?.reason || row.reason,
          score: boosted,
        });
      }
    }
  }

  const citations = Array.from(merged.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  const answer = await answerWithContext({ question: trimmed, citations, history });

  return { answer, citations };
}
