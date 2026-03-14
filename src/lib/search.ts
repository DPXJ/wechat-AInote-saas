import { answerWithContext, createEmbeddings, isAiConfigured } from "@/lib/ai";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { SearchCitation, SearchResponse } from "@/lib/types";
import { cosineSimilarity, safeJsonParse, trimText } from "@/lib/utils";

function buildTsQuery(query: string) {
  return query
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .map((token) => `${token.replace(/["']/g, "")}:*`)
    .join(" | ");
}

export async function searchKnowledge(
  userId: string,
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

  const supabase = getSupabaseAdmin();
  const merged = new Map<string, SearchCitation>();

  const tsQuery = buildTsQuery(trimmed);
  if (tsQuery) {
    const { data: ftsRows } = await supabase
      .from("chunks")
      .select("id, record_id, content, reason")
      .eq("user_id", userId)
      .textSearch("tsv", tsQuery)
      .limit(8);

    if (ftsRows && ftsRows.length > 0) {
      const recordIds = [...new Set(ftsRows.map((r) => r.record_id))];
      const { data: recordRows } = await supabase
        .from("records")
        .select("id, title, source_label")
        .in("id", recordIds);
      const recordMap = new Map((recordRows || []).map((r) => [r.id, r]));

      for (const row of ftsRows) {
        const rec = recordMap.get(row.record_id);
        merged.set(row.id, {
          recordId: row.record_id,
          title: rec?.title || "",
          sourceLabel: rec?.source_label || "",
          snippet: trimText(row.content, 220),
          reason: row.reason,
          score: 2,
        });
      }
    }
  }

  if (merged.size === 0) {
    const like = `%${trimmed}%`;
    const { data: likeChunks } = await supabase
      .from("chunks")
      .select("id, record_id, content, reason")
      .eq("user_id", userId)
      .ilike("content", like)
      .order("created_at", { ascending: false })
      .limit(8);

    if (likeChunks && likeChunks.length > 0) {
      const recordIds = [...new Set(likeChunks.map((r) => r.record_id))];
      const { data: recordRows } = await supabase
        .from("records")
        .select("id, title, source_label")
        .in("id", recordIds);
      const recordMap = new Map((recordRows || []).map((r) => [r.id, r]));

      for (const row of likeChunks) {
        const rec = recordMap.get(row.record_id);
        merged.set(row.id, {
          recordId: row.record_id,
          title: rec?.title || "",
          sourceLabel: rec?.source_label || "",
          snippet: trimText(row.content, 220),
          reason: row.reason,
          score: 1,
        });
      }
    }

    const { data: titleMatches } = await supabase
      .from("records")
      .select("id, title, source_label, summary")
      .eq("user_id", userId)
      .or(`title.ilike.${like},summary.ilike.${like}`)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(5);

    for (const row of titleMatches || []) {
      if (!merged.has(`rec-${row.id}`)) {
        merged.set(`rec-${row.id}`, {
          recordId: row.id,
          title: row.title,
          sourceLabel: row.source_label,
          snippet: trimText(row.summary || "", 220),
          reason: "标题或摘要匹配",
          score: 1.5,
        });
      }
    }
  }

  const todoLike = `%${trimmed}%`;
  const { data: todoMatches } = await supabase
    .from("todos")
    .select("id, content, priority, status, created_at, record_id")
    .eq("user_id", userId)
    .neq("status", "deleted")
    .ilike("content", todoLike)
    .order("created_at", { ascending: false })
    .limit(5);

  for (const t of todoMatches || []) {
    const pLabel: Record<string, string> = { urgent: "紧急", high: "高", medium: "中", low: "低" };
    merged.set(`todo-${t.id}`, {
      recordId: t.record_id || "",
      title: `[待办] ${trimText(t.content, 40)}`,
      sourceLabel: `待办 · ${pLabel[t.priority] || t.priority} · ${t.status === "done" ? "已完成" : "待处理"}`,
      snippet: t.content,
      reason: "匹配待办事项",
      score: 0.8,
    });
  }

  if (isAiConfigured()) {
    const { data: embeddingRows } = await supabase
      .from("chunks")
      .select("id, record_id, content, reason, embedding")
      .eq("user_id", userId)
      .not("embedding", "is", null)
      .order("created_at", { ascending: false })
      .limit(80);

    if (embeddingRows && embeddingRows.length > 0) {
      const recordIds = [...new Set(embeddingRows.map((r) => r.record_id))];
      const { data: recordRows } = await supabase
        .from("records")
        .select("id, title, source_label")
        .in("id", recordIds);
      const recordMap = new Map((recordRows || []).map((r) => [r.id, r]));

      const [queryEmbedding] = (await createEmbeddings([trimmed])) || [];
      if (queryEmbedding) {
        for (const row of embeddingRows) {
          const vector = safeJsonParse<number[]>(row.embedding, []);
          const score = cosineSimilarity(queryEmbedding, vector);
          if (score < 0.42) continue;

          const rec = recordMap.get(row.record_id);
          const previous = merged.get(row.id);
          const boosted = score * 10 + (previous?.score || 0);
          merged.set(row.id, {
            recordId: row.record_id,
            title: rec?.title || "",
            sourceLabel: rec?.source_label || "",
            snippet: trimText(row.content, 220),
            reason: previous?.reason || row.reason,
            score: boosted,
          });
        }
      }
    }
  }

  const citations = Array.from(merged.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  const answer = await answerWithContext({ question: trimmed, citations, history });

  return { answer, citations };
}
