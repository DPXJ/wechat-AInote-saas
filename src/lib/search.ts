import { answerWithContext, createEmbeddings, isAiConfiguredFromSettings } from "@/lib/ai";
import { getIntegrationSettings } from "@/lib/settings";
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
  opts?: { skipAnswer?: boolean },
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
  const like = `%${trimmed}%`;
  const tsQuery = buildTsQuery(trimmed);

  const settingsP = getIntegrationSettings(userId);

  const ftsP = tsQuery
    ? supabase
        .from("chunks")
        .select("id, record_id, content, reason")
        .eq("user_id", userId)
        .textSearch("tsv", tsQuery)
        .limit(8)
        .then((r) => r.data || [])
    : Promise.resolve([]);

  const likeP = supabase
    .from("chunks")
    .select("id, record_id, content, reason")
    .eq("user_id", userId)
    .ilike("content", like)
    .order("created_at", { ascending: false })
    .limit(8)
    .then((r) => r.data || []);

  const titleP = supabase
    .from("records")
    .select("id, title, source_label, summary")
    .eq("user_id", userId)
    .or(`title.ilike.${like},summary.ilike.${like}`)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(5)
    .then((r) => r.data || []);

  const todoP = supabase
    .from("todos")
    .select("id, content, priority, status, created_at, record_id")
    .eq("user_id", userId)
    .neq("status", "deleted")
    .ilike("content", like)
    .order("created_at", { ascending: false })
    .limit(5)
    .then((r) => r.data || []);

  const [ftsRows, likeChunks, titleMatches, todoMatches, settings] = await Promise.all([
    ftsP,
    likeP,
    titleP,
    todoP,
    settingsP,
  ]);

  const allChunkRows = [...ftsRows, ...likeChunks];
  const chunkRecordIds = [...new Set(allChunkRows.map((r) => r.record_id))];

  let chunkRecordMap = new Map<string, { id: string; title: string; source_label: string }>();
  if (chunkRecordIds.length > 0) {
    const { data: recordRows } = await supabase
      .from("records")
      .select("id, title, source_label")
      .in("id", chunkRecordIds);
    chunkRecordMap = new Map((recordRows || []).map((r) => [r.id, r]));
  }

  for (const row of ftsRows) {
    const rec = chunkRecordMap.get(row.record_id);
    merged.set(row.id, {
      recordId: row.record_id,
      title: rec?.title || "",
      sourceLabel: rec?.source_label || "",
      snippet: trimText(row.content, 220),
      reason: row.reason,
      score: 2,
    });
  }

  if (merged.size === 0) {
    for (const row of likeChunks) {
      const rec = chunkRecordMap.get(row.record_id);
      merged.set(row.id, {
        recordId: row.record_id,
        title: rec?.title || "",
        sourceLabel: rec?.source_label || "",
        snippet: trimText(row.content, 220),
        reason: row.reason,
        score: 1,
      });
    }

    for (const row of titleMatches) {
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

  const pLabel: Record<string, string> = { urgent: "紧急", high: "高", medium: "中", low: "低" };
  for (const t of todoMatches) {
    merged.set(`todo-${t.id}`, {
      recordId: t.record_id || "",
      title: `[待办] ${trimText(t.content, 40)}`,
      sourceLabel: `待办 · ${pLabel[t.priority] || t.priority} · ${t.status === "done" ? "已完成" : "待处理"}`,
      snippet: t.content,
      reason: "匹配待办事项",
      score: 0.8,
    });
  }

  if (isAiConfiguredFromSettings(settings)) {
    const { data: embeddingRows } = await supabase
      .from("chunks")
      .select("id, record_id, content, reason, embedding")
      .eq("user_id", userId)
      .not("embedding", "is", null)
      .order("created_at", { ascending: false })
      .limit(30);

    if (embeddingRows && embeddingRows.length > 0) {
      const embRecordIds = [...new Set(embeddingRows.map((r) => r.record_id))].filter((id) => !chunkRecordMap.has(id));
      let embRecordMap = chunkRecordMap;
      if (embRecordIds.length > 0) {
        const { data: recordRows } = await supabase
          .from("records")
          .select("id, title, source_label")
          .in("id", embRecordIds);
        embRecordMap = new Map([...chunkRecordMap, ...(recordRows || []).map((r) => [r.id, r] as const)]);
      }

      const [queryEmbedding] = (await createEmbeddings(userId, [trimmed])) || [];
      if (queryEmbedding) {
        for (const row of embeddingRows) {
          const vector = safeJsonParse<number[]>(row.embedding, []);
          const score = cosineSimilarity(queryEmbedding, vector);
          if (score < 0.42) continue;

          const rec = embRecordMap.get(row.record_id);
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

  if (opts?.skipAnswer) {
    return { answer: "", citations };
  }

  const answer = await answerWithContext(userId, { question: trimmed, citations, history });

  return { answer, citations };
}
