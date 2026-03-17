import crypto from "node:crypto";
import { analyzeRecord, createEmbeddings } from "@/lib/ai";
import { extractTextFromUpload } from "@/lib/parsers";
import { deleteStoredUpload, readStoredUpload, storeUpload } from "@/lib/storage";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import type {
  AnalysisOutput,
  KnowledgeRecord,
  RecordAsset,
  RecordInput,
  RecordType,
  StoredUpload,
  SyncRun,
  SyncTarget,
} from "@/lib/types";
import {
  chunkText,
  createId,
  inferRecordType,
  nowIso,
} from "@/lib/utils";

type RecordRow = Database["public"]["Tables"]["records"]["Row"];
type AssetRow = Database["public"]["Tables"]["assets"]["Row"];
type SyncRow = Database["public"]["Tables"]["sync_runs"]["Row"];

function mapAsset(row: AssetRow): RecordAsset {
  return {
    id: row.id,
    recordId: row.record_id,
    originalName: row.original_name,
    mimeType: row.mime_type,
    byteSize: Number(row.byte_size),
    storageKey: row.storage_key,
    tags: row.tags || [],
    description: row.description || "",
    ocrText: row.ocr_text || "",
    createdAt: row.created_at,
  };
}

function mapSync(row: SyncRow): SyncRun {
  return {
    id: row.id,
    recordId: row.record_id,
    target: row.target as SyncRun["target"],
    status: row.status as SyncRun["status"],
    externalRef: row.external_ref || null,
    payload: (row.payload as Record<string, unknown>) || {},
    message: row.message || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapRecord(row: RecordRow, assets: AssetRow[], syncRows: SyncRow[]): KnowledgeRecord {
  return {
    id: row.id,
    title: row.title,
    sourceLabel: row.source_label,
    sourceChannel: row.source_channel,
    recordType: row.record_type as RecordType,
    contentText: row.content_text,
    extractedText: row.extracted_text,
    summary: row.summary,
    contextNote: row.context_note,
    keywords: row.keywords || [],
    actionItems: row.action_items || [],
    suggestedTargets: (row.suggested_targets || []) as SyncTarget[],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    assets: assets.map(mapAsset),
    syncRuns: syncRows.map(mapSync),
  };
}

function buildChunkReason(title: string, sourceLabel: string) {
  return `命中《${title}》中的相关片段，来源为 ${sourceLabel}`;
}

export async function createKnowledgeRecord(
  userId: string,
  input: RecordInput,
  uploads: StoredUpload[],
  fileMeta?: Array<{ tags?: string[]; description?: string }>,
  opts?: { enableAiSummary?: boolean; enableAiTodo?: boolean; linkToTodo?: boolean },
) {
  const enableAiSummary = opts?.enableAiSummary !== false;
  const enableAiTodo = opts?.enableAiTodo !== false;
  const linkToTodo = opts?.linkToTodo === true;
  const supabase = getSupabaseAdmin();
  const recordId = createId("rec");
  const createdAt = nowIso();
  const assetNames = uploads.map((item) => item.originalName);
  type AssetInsert = Database["public"]["Tables"]["assets"]["Insert"];
  const storedAssets: AssetInsert[] = [];
  const extractedParts: string[] = [];

  for (let i = 0; i < uploads.length; i++) {
    const upload = uploads[i];
    const meta = fileMeta?.[i];
    const fileHash = crypto.createHash("md5").update(upload.buffer).digest("hex");

    const { data: existingAsset } = await supabase
      .from("assets")
      .select("id, storage_key")
      .eq("file_hash", fileHash)
      .eq("user_id", userId)
      .maybeSingle();

    const stored = existingAsset
      ? { fileId: existingAsset.id, storageKey: existingAsset.storage_key, absolutePath: "" }
      : await storeUpload(upload.buffer, upload.originalName, upload.mimeType, userId);

    const extractedText = await extractTextFromUpload(upload);
    if (extractedText.trim()) {
      extractedParts.push(`附件 ${upload.originalName} 抽取内容:\n${extractedText.trim()}`);
    }

    const tags = meta?.tags ?? [];
    let description = meta?.description ?? "";

    let ocrText = "";
    if (upload.mimeType.startsWith("image/")) {
      try {
        const { ocrImage } = await import("@/lib/ocr");
        const ocrResult = await ocrImage(userId, upload.buffer, upload.mimeType);
        ocrText = ocrResult.text;
        if (ocrResult.keywords.length > 0) {
          tags.push(...ocrResult.keywords.filter((k) => !tags.includes(k)));
        }
        if (!description && ocrResult.description) {
          description = ocrResult.description;
        }
        if (ocrText.trim()) {
          extractedParts.push(`图片 ${upload.originalName} OCR识别:\n${ocrText.trim()}`);
        }
      } catch {
        // OCR non-critical
      }
    }

    const assetId = existingAsset ? createId("asset") : stored.fileId;
    storedAssets.push({
      id: assetId,
      record_id: recordId,
      user_id: userId,
      original_name: upload.originalName,
      mime_type: upload.mimeType,
      byte_size: upload.byteSize,
      storage_key: stored.storageKey,
      tags,
      description: description || "",
      ocr_text: ocrText,
      file_hash: fileHash,
      created_at: createdAt,
    });
  }

  const contentText = input.contentText?.trim() || "";
  const extractedText = extractedParts.join("\n\n");
  const sourceLabel = input.sourceLabel?.trim() || "手动收件箱";
  const contextNote = input.contextNote?.trim() || "";
  const recordType =
    input.recordTypeHint || inferRecordType(uploads.map((item) => item.mimeType));

  let analysis: AnalysisOutput;
  if (enableAiSummary) {
    analysis = await analyzeRecord(userId, {
      title: input.title?.trim() || contentText.slice(0, 42) || (storedAssets[0]?.original_name as string) || "未命名资料",
      sourceLabel,
      recordType,
      contentText,
      extractedText,
      contextNote,
      assetNames,
    });
  } else {
    const textContent = (contentText || extractedText).trim().slice(0, 50);
    analysis = {
      summary: textContent || "已收录一条信息。",
      keywords: input.userTags ?? [],
      actionItems: [],
      suggestedTargets: [],
    };
  }

  // 标题优先级：用户输入 > AI 生成 > 文本内容 > 图片文件名
  const textContent = (contentText || extractedText).trim().slice(0, 42);
  const firstAssetName = storedAssets[0]?.original_name as string | undefined;
  const title =
    input.title?.trim() ||
    (enableAiSummary && analysis.title && analysis.title.trim()) ||
    textContent ||
    firstAssetName ||
    "未命名资料";

  const userTags = input.userTags ?? [];

  const combinedText = [contentText, extractedText, contextNote].filter(Boolean).join("\n\n");

  await supabase.from("records").insert({
    id: recordId,
    user_id: userId,
    title,
    source_label: sourceLabel,
    source_channel: "manual-web",
    record_type: recordType,
    content_text: contentText,
    extracted_text: extractedText,
    summary: analysis.summary,
    context_note: contextNote,
    keywords: userTags,
    action_items: analysis.actionItems,
    suggested_targets: analysis.suggestedTargets,
    created_at: createdAt,
    updated_at: createdAt,
  });

  if (storedAssets.length > 0) {
    await supabase.from("assets").insert(storedAssets);
  }

  const chunks = chunkText(combinedText || analysis.summary);
  const chunkEmbeddings = await createEmbeddings(userId, chunks);
  const chunkRows = chunks.map((chunk, index) => {
    const chunkId = createId("chk");
    return {
      id: chunkId,
      record_id: recordId,
      user_id: userId,
      chunk_index: index,
      content: chunk,
      reason: buildChunkReason(title, sourceLabel),
      embedding: chunkEmbeddings ? JSON.stringify(chunkEmbeddings[index]) : null,
      created_at: createdAt,
    };
  });

  if (chunkRows.length > 0) {
    await supabase.from("chunks").insert(chunkRows);
  }

  const created: KnowledgeRecord = {
    id: recordId,
    title,
    sourceLabel,
    sourceChannel: "manual-web",
    recordType: recordType as RecordType,
    contentText,
    extractedText,
    summary: analysis.summary,
    contextNote,
    keywords: userTags,
    actionItems: analysis.actionItems,
    suggestedTargets: analysis.suggestedTargets,
    createdAt: createdAt,
    updatedAt: createdAt,
    assets: storedAssets.map((a) => ({
      id: a.id,
      recordId: a.record_id,
      originalName: a.original_name as string,
      mimeType: a.mime_type as string,
      byteSize: Number(a.byte_size),
      storageKey: a.storage_key as string,
      tags: (a.tags as string[]) || [],
      description: (a.description as string) || "",
      ocrText: (a.ocr_text as string) || "",
      createdAt: a.created_at as string,
    })),
    syncRuns: [],
  };

  const { extractTodosFromRecord, createTodoFromRecord } = await import("@/lib/todos");
  if (linkToTodo) {
    await createTodoFromRecord(userId, created);
  } else if (enableAiTodo && analysis.actionItems.length > 0) {
    await extractTodosFromRecord(userId, created);
  }

  return created;
}

export async function listKnowledgeRecords(
  userId: string,
  opts?: { limit?: number; offset?: number; includeDeleted?: boolean },
) {
  const supabase = getSupabaseAdmin();
  const limit = opts?.limit ?? 20;
  const offset = opts?.offset ?? 0;

  let countQuery = supabase
    .from("records")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if (!opts?.includeDeleted) {
    countQuery = countQuery.is("deleted_at", null);
  }

  let query = supabase
    .from("records")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (!opts?.includeDeleted) {
    query = query.is("deleted_at", null);
  }

  const [{ count: total }, { data: rows }] = await Promise.all([countQuery, query]);

  const recordIds = ((rows || []) as RecordRow[]).map((r) => r.id);
  if (recordIds.length === 0) return { records: [], total: total ?? 0 };

  const [{ data: allAssets }, { data: allSyncRuns }] = await Promise.all([
    supabase.from("assets").select("*").in("record_id", recordIds).order("created_at", { ascending: true }),
    supabase.from("sync_runs").select("*").in("record_id", recordIds).order("created_at", { ascending: false }),
  ]);

  const assetsByRecord = new Map<string, AssetRow[]>();
  for (const a of (allAssets || []) as AssetRow[]) {
    const list = assetsByRecord.get(a.record_id) || [];
    list.push(a);
    assetsByRecord.set(a.record_id, list);
  }

  const syncsByRecord = new Map<string, SyncRow[]>();
  for (const s of (allSyncRuns || []) as SyncRow[]) {
    const list = syncsByRecord.get(s.record_id) || [];
    list.push(s);
    syncsByRecord.set(s.record_id, list);
  }

  const records = ((rows || []) as RecordRow[]).map((row) =>
    mapRecord(row, assetsByRecord.get(row.id) || [], syncsByRecord.get(row.id) || []),
  );

  return { records, total: total ?? 0 };
}

export async function listDeletedRecords(
  userId: string,
  opts?: { limit?: number; offset?: number },
) {
  const supabase = getSupabaseAdmin();
  const limit = opts?.limit ?? 50;
  const offset = opts?.offset ?? 0;

  const [{ count: total }, { data: rows }] = await Promise.all([
    supabase.from("records").select("id", { count: "exact", head: true }).eq("user_id", userId).not("deleted_at", "is", null),
    supabase.from("records").select("*").eq("user_id", userId).not("deleted_at", "is", null).order("deleted_at", { ascending: false }).range(offset, offset + limit - 1),
  ]);

  const recordIds = ((rows || []) as RecordRow[]).map((r) => r.id);
  if (recordIds.length === 0) return { records: [], total: total ?? 0 };

  const [{ data: allAssets }, { data: allSyncRuns }] = await Promise.all([
    supabase.from("assets").select("*").in("record_id", recordIds).order("created_at", { ascending: true }),
    supabase.from("sync_runs").select("*").in("record_id", recordIds).order("created_at", { ascending: false }),
  ]);

  const assetsByRecord = new Map<string, AssetRow[]>();
  for (const a of (allAssets || []) as AssetRow[]) {
    const list = assetsByRecord.get(a.record_id) || [];
    list.push(a);
    assetsByRecord.set(a.record_id, list);
  }

  const syncsByRecord = new Map<string, SyncRow[]>();
  for (const s of (allSyncRuns || []) as SyncRow[]) {
    const list = syncsByRecord.get(s.record_id) || [];
    list.push(s);
    syncsByRecord.set(s.record_id, list);
  }

  const records = ((rows || []) as RecordRow[]).map((row) =>
    mapRecord(row, assetsByRecord.get(row.id) || [], syncsByRecord.get(row.id) || []),
  );
  return { records, total: total ?? 0 };
}

export async function softDeleteRecord(userId: string, recordId: string) {
  const now = nowIso();
  await getSupabaseAdmin()
    .from("records")
    .update({ deleted_at: now, updated_at: now })
    .eq("id", recordId)
    .eq("user_id", userId);
}

export async function restoreRecord(userId: string, recordId: string) {
  await getSupabaseAdmin()
    .from("records")
    .update({ deleted_at: null, updated_at: nowIso() })
    .eq("id", recordId)
    .eq("user_id", userId);
}

export async function cleanupOldDeletedRecords(userId: string, days = 30) {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const { data: rows } = await getSupabaseAdmin()
    .from("records")
    .select("id")
    .eq("user_id", userId)
    .not("deleted_at", "is", null)
    .lt("deleted_at", cutoff);
  return (rows || []).map((r) => r.id as string);
}

export async function getKnowledgeRecord(userId: string, recordId: string) {
  const supabase = getSupabaseAdmin();

  const { data: row } = await supabase
    .from("records")
    .select("*")
    .eq("id", recordId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!row) return null;

  const { data: assets } = await supabase
    .from("assets")
    .select("*")
    .eq("record_id", recordId)
    .order("created_at", { ascending: true });

  const { data: syncRows } = await supabase
    .from("sync_runs")
    .select("*")
    .eq("record_id", recordId)
    .order("created_at", { ascending: false });

  return mapRecord(row as RecordRow, (assets || []) as AssetRow[], (syncRows || []) as SyncRow[]);
}

export async function getAssetById(userId: string, assetId: string): Promise<AssetRow | null> {
  const { data } = await getSupabaseAdmin()
    .from("assets")
    .select("*")
    .eq("id", assetId)
    .eq("user_id", userId)
    .maybeSingle();
  return (data ?? null) as AssetRow | null;
}

export async function readAssetBuffer(
  userId: string,
  assetId: string,
  options?: { download?: boolean },
) {
  const asset = await getAssetById(userId, assetId);
  if (!asset) return null;

  const content = await readStoredUpload(
    asset.storage_key,
    { download: options?.download, fileName: asset.original_name },
    userId,
  );
  return { asset: mapAsset(asset), content };
}

export async function deleteKnowledgeRecord(userId: string, recordId: string) {
  await softDeleteRecord(userId, recordId);
}

export async function hardDeleteRecord(userId: string, recordId: string) {
  const supabase = getSupabaseAdmin();
  const { data: assets } = await supabase
    .from("assets")
    .select("storage_key")
    .eq("record_id", recordId)
    .eq("user_id", userId);

  for (const asset of assets || []) {
    await deleteStoredUpload(asset.storage_key, userId);
  }

  await supabase.from("chunks").delete().eq("record_id", recordId).eq("user_id", userId);
  await supabase.from("sync_runs").delete().eq("record_id", recordId).eq("user_id", userId);
  await supabase.from("assets").delete().eq("record_id", recordId).eq("user_id", userId);
  await supabase.from("favorites").delete().eq("record_id", recordId).eq("user_id", userId);
  await supabase.from("records").delete().eq("id", recordId).eq("user_id", userId);
}

export async function updateKnowledgeRecord(
  userId: string,
  recordId: string,
  fields: { title?: string; contextNote?: string; sourceLabel?: string; contentText?: string },
) {
  const updates: Record<string, string> = { updated_at: nowIso() };

  if (fields.title !== undefined) updates.title = fields.title;
  if (fields.contextNote !== undefined) updates.context_note = fields.contextNote;
  if (fields.sourceLabel !== undefined) updates.source_label = fields.sourceLabel;
  if (fields.contentText !== undefined) updates.content_text = fields.contentText;

  await getSupabaseAdmin()
    .from("records")
    .update(updates)
    .eq("id", recordId)
    .eq("user_id", userId);

  return getKnowledgeRecord(userId, recordId);
}

export async function readAssetThumbnail(userId: string, assetId: string) {
  const asset = await getAssetById(userId, assetId);
  if (!asset) return null;
  if (!asset.mime_type.startsWith("image/")) return null;

  const content = await readStoredUpload(asset.storage_key, { thumbnail: true }, userId);
  return { asset: mapAsset(asset), content };
}

export async function updateAssetOcr(
  userId: string,
  assetId: string,
  ocrText: string,
  keywords: string[],
  description: string,
) {
  const asset = await getAssetById(userId, assetId);
  if (!asset) return null;

  const existingTags: string[] = asset.tags || [];
  const mergedTags = [...existingTags, ...keywords.filter((k: string) => !existingTags.includes(k))];

  await getSupabaseAdmin()
    .from("assets")
    .update({
      ocr_text: ocrText,
      tags: mergedTags,
      description: asset.description ? asset.description : description,
    })
    .eq("id", assetId)
    .eq("user_id", userId);

  return getAssetById(userId, assetId);
}

export async function addSyncRun(
  userId: string,
  input: {
    recordId: string;
    target: SyncRun["target"];
    status: SyncRun["status"];
    externalRef?: string | null;
    payload?: Record<string, unknown>;
    message?: string;
  },
) {
  const createdAt = nowIso();
  await getSupabaseAdmin().from("sync_runs").insert({
    id: createId("sync"),
    record_id: input.recordId,
    user_id: userId,
    target: input.target,
    status: input.status,
    external_ref: input.externalRef || null,
    payload: input.payload || {},
    message: input.message || "",
    created_at: createdAt,
    updated_at: createdAt,
  });
}
