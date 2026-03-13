import { analyzeRecord, createEmbeddings } from "@/lib/ai";
import { getDb } from "@/lib/db";
import { ocrImage } from "@/lib/ocr";
import { extractTextFromUpload } from "@/lib/parsers";
import { deleteStoredUpload, readStoredUpload, storeUpload } from "@/lib/storage";
import { extractTodosFromRecord } from "@/lib/todos";
import type {
  AnalysisOutput,
  KnowledgeRecord,
  RecordAsset,
  RecordInput,
  RecordType,
  StoredUpload,
  SyncRun,
} from "@/lib/types";
import {
  chunkText,
  createId,
  inferRecordType,
  nowIso,
  safeJsonParse,
} from "@/lib/utils";

type RecordRow = {
  id: string;
  title: string;
  source_label: string;
  source_channel: string;
  record_type: RecordType;
  content_text: string;
  extracted_text: string;
  summary: string;
  context_note: string;
  keywords: string;
  action_items: string;
  suggested_targets: string;
  created_at: string;
  updated_at: string;
};

type AssetRow = {
  id: string;
  record_id: string;
  original_name: string;
  mime_type: string;
  byte_size: number;
  storage_key: string;
  tags: string;
  description: string;
  ocr_text: string;
  created_at: string;
};

type SyncRow = {
  id: string;
  record_id: string;
  target: string;
  status: string;
  external_ref: string | null;
  payload: string;
  message: string;
  created_at: string;
  updated_at: string;
};

function mapAsset(row: AssetRow): RecordAsset {
  return {
    id: row.id,
    recordId: row.record_id,
    originalName: row.original_name,
    mimeType: row.mime_type,
    byteSize: row.byte_size,
    storageKey: row.storage_key,
    tags: safeJsonParse(row.tags, []),
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
    externalRef: row.external_ref,
    payload: safeJsonParse(row.payload, {}),
    message: row.message,
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
    recordType: row.record_type,
    contentText: row.content_text,
    extractedText: row.extracted_text,
    summary: row.summary,
    contextNote: row.context_note,
    keywords: safeJsonParse(row.keywords, []),
    actionItems: safeJsonParse(row.action_items, []),
    suggestedTargets: safeJsonParse(row.suggested_targets, []),
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
  input: RecordInput,
  uploads: StoredUpload[],
  fileMeta?: Array<{ tags?: string[]; description?: string }>,
) {
  const db = getDb();
  const recordId = createId("rec");
  const createdAt = nowIso();
  const assetNames = uploads.map((item) => item.originalName);
  const storedAssets: AssetRow[] = [];
  const extractedParts: string[] = [];

  for (let i = 0; i < uploads.length; i++) {
    const upload = uploads[i];
    const meta = fileMeta?.[i];
    const stored = await storeUpload(
      upload.buffer,
      upload.originalName,
      upload.mimeType,
    );
    const extractedText = await extractTextFromUpload(upload);
    if (extractedText.trim()) {
      extractedParts.push(
        `附件 ${upload.originalName} 抽取内容:\n${extractedText.trim()}`,
      );
    }

    const tags = meta?.tags ?? [];
    let description = meta?.description ?? "";

    let ocrText = "";
    if (upload.mimeType.startsWith("image/")) {
      try {
        const ocrResult = await ocrImage(upload.buffer, upload.mimeType);
        if (ocrResult) {
          ocrText = ocrResult.text;
          if (ocrResult.keywords.length > 0) {
            tags.push(...ocrResult.keywords.filter((k) => !tags.includes(k)));
          }
          if (!description && ocrResult.description) {
            description = ocrResult.description;
          }
          if (ocrText.trim()) {
            extractedParts.push(
              `图片 ${upload.originalName} OCR识别:\n${ocrText.trim()}`,
            );
          }
        }
      } catch {
        // OCR non-critical
      }
    }

    storedAssets.push({
      id: stored.fileId,
      record_id: recordId,
      original_name: upload.originalName,
      mime_type: upload.mimeType,
      byte_size: upload.byteSize,
      storage_key: stored.storageKey,
      tags: JSON.stringify(tags),
      description: description || "",
      ocr_text: ocrText,
      created_at: createdAt,
    });
  }

  const contentText = input.contentText?.trim() || "";
  const extractedText = extractedParts.join("\n\n");
  const title =
    input.title?.trim() ||
    storedAssets[0]?.original_name ||
    contentText.slice(0, 42) ||
    "未命名资料";
  const sourceLabel = input.sourceLabel?.trim() || "手动收件箱";
  const contextNote = input.contextNote?.trim() || "";
  const recordType =
    input.recordTypeHint || inferRecordType(uploads.map((item) => item.mimeType));
  const analysis: AnalysisOutput = await analyzeRecord({
    title,
    sourceLabel,
    recordType,
    contentText,
    extractedText,
    contextNote,
    assetNames,
  });
  const combinedText = [contentText, extractedText, contextNote]
    .filter(Boolean)
    .join("\n\n");

  db.prepare(
    `
      INSERT INTO records (
        id, title, source_label, source_channel, record_type, content_text,
        extracted_text, summary, context_note, keywords, action_items,
        suggested_targets, created_at, updated_at
      ) VALUES (
        @id, @title, @source_label, @source_channel, @record_type, @content_text,
        @extracted_text, @summary, @context_note, @keywords, @action_items,
        @suggested_targets, @created_at, @updated_at
      )
    `,
  ).run({
    id: recordId,
    title,
    source_label: sourceLabel,
    source_channel: "manual-web",
    record_type: recordType,
    content_text: contentText,
    extracted_text: extractedText,
    summary: analysis.summary,
    context_note: contextNote,
    keywords: JSON.stringify(analysis.keywords),
    action_items: JSON.stringify(analysis.actionItems),
    suggested_targets: JSON.stringify(analysis.suggestedTargets),
    created_at: createdAt,
    updated_at: createdAt,
  });

  const insertAsset = db.prepare(`
    INSERT INTO assets (
      id, record_id, original_name, mime_type, byte_size, storage_key,
      tags, description, ocr_text, created_at
    ) VALUES (
      @id, @record_id, @original_name, @mime_type, @byte_size, @storage_key,
      @tags, @description, @ocr_text, @created_at
    )
  `);

  for (const asset of storedAssets) {
    insertAsset.run(asset);
  }

  const chunks = chunkText(combinedText || analysis.summary);
  const chunkEmbeddings = await createEmbeddings(chunks);
  const insertChunk = db.prepare(`
    INSERT INTO chunks (
      id, record_id, chunk_index, content, reason, embedding, created_at
    ) VALUES (
      @id, @record_id, @chunk_index, @content, @reason, @embedding, @created_at
    )
  `);
  const insertFts = db.prepare(`
    INSERT INTO chunks_fts (chunk_id, record_id, content, reason)
    VALUES (@chunk_id, @record_id, @content, @reason)
  `);

  chunks.forEach((chunk, index) => {
    const chunkId = createId("chk");
    const payload = {
      id: chunkId,
      record_id: recordId,
      chunk_index: index,
      content: chunk,
      reason: buildChunkReason(title, sourceLabel),
      embedding: chunkEmbeddings ? JSON.stringify(chunkEmbeddings[index]) : null,
      created_at: createdAt,
    };
    insertChunk.run(payload);
    insertFts.run({
      chunk_id: chunkId,
      record_id: recordId,
      content: chunk,
      reason: payload.reason,
    });
  });

  const created = getKnowledgeRecord(recordId);
  if (created) {
    try {
      extractTodosFromRecord(created);
    } catch {
      // non-critical
    }
  }
  return created;
}

export function listKnowledgeRecords(opts?: { limit?: number; offset?: number }) {
  const db = getDb();
  const limit = opts?.limit ?? 20;
  const offset = opts?.offset ?? 0;

  const { total } = db
    .prepare(`SELECT count(*) as total FROM records`)
    .get() as { total: number };

  const rows = db
    .prepare(
      `SELECT * FROM records ORDER BY datetime(created_at) DESC LIMIT ? OFFSET ?`,
    )
    .all(limit, offset) as RecordRow[];

  const records = rows
    .map((row) => getKnowledgeRecord(row.id))
    .filter(Boolean) as KnowledgeRecord[];

  return { records, total };
}

export function getKnowledgeRecord(recordId: string) {
  const db = getDb();
  const row = db
    .prepare(`SELECT * FROM records WHERE id = ?`)
    .get(recordId) as RecordRow | undefined;

  if (!row) {
    return null;
  }

  const assets = db
    .prepare(`SELECT * FROM assets WHERE record_id = ? ORDER BY created_at ASC`)
    .all(recordId) as AssetRow[];
  const syncRows = db
    .prepare(`SELECT * FROM sync_runs WHERE record_id = ? ORDER BY created_at DESC`)
    .all(recordId) as SyncRow[];

  return mapRecord(row, assets, syncRows);
}

export function getAssetById(assetId: string) {
  const db = getDb();
  return db
    .prepare(`SELECT * FROM assets WHERE id = ?`)
    .get(assetId) as AssetRow | undefined;
}

export async function readAssetBuffer(
  assetId: string,
  options?: { download?: boolean },
) {
  const asset = getAssetById(assetId);
  if (!asset) {
    return null;
  }

  const content = await readStoredUpload(asset.storage_key, {
    download: options?.download,
    fileName: asset.original_name,
  });
  return { asset: mapAsset(asset), content };
}

export async function deleteKnowledgeRecord(recordId: string) {
  const db = getDb();
  const assets = db
    .prepare(`SELECT * FROM assets WHERE record_id = ?`)
    .all(recordId) as AssetRow[];

  for (const asset of assets) {
    await deleteStoredUpload(asset.storage_key);
  }

  db.prepare(`DELETE FROM chunks_fts WHERE record_id = ?`).run(recordId);
  db.prepare(`DELETE FROM chunks WHERE record_id = ?`).run(recordId);
  db.prepare(`DELETE FROM sync_runs WHERE record_id = ?`).run(recordId);
  db.prepare(`DELETE FROM assets WHERE record_id = ?`).run(recordId);
  db.prepare(`DELETE FROM records WHERE id = ?`).run(recordId);
}

export function updateKnowledgeRecord(
  recordId: string,
  fields: { title?: string; contextNote?: string; sourceLabel?: string },
) {
  const db = getDb();
  const sets: string[] = [];
  const values: Record<string, string> = { id: recordId, updated_at: nowIso() };

  if (fields.title !== undefined) {
    sets.push("title = @title");
    values.title = fields.title;
  }
  if (fields.contextNote !== undefined) {
    sets.push("context_note = @context_note");
    values.context_note = fields.contextNote;
  }
  if (fields.sourceLabel !== undefined) {
    sets.push("source_label = @source_label");
    values.source_label = fields.sourceLabel;
  }

  if (sets.length === 0) return getKnowledgeRecord(recordId);

  sets.push("updated_at = @updated_at");

  db.prepare(`UPDATE records SET ${sets.join(", ")} WHERE id = @id`).run(values);

  return getKnowledgeRecord(recordId);
}

export async function readAssetThumbnail(assetId: string) {
  const asset = getAssetById(assetId);
  if (!asset) return null;
  if (!asset.mime_type.startsWith("image/")) return null;

  const content = await readStoredUpload(asset.storage_key, { thumbnail: true });
  return { asset: mapAsset(asset), content };
}

export function updateAssetOcr(
  assetId: string,
  ocrText: string,
  keywords: string[],
  description: string,
) {
  const db = getDb();
  const asset = getAssetById(assetId);
  if (!asset) return null;

  const existingTags: string[] = safeJsonParse(asset.tags, []);
  const mergedTags = [...existingTags, ...keywords.filter((k) => !existingTags.includes(k))];

  db.prepare(
    `UPDATE assets SET ocr_text = @ocr_text, tags = @tags, description = CASE WHEN description = '' THEN @description ELSE description END WHERE id = @id`,
  ).run({
    id: assetId,
    ocr_text: ocrText,
    tags: JSON.stringify(mergedTags),
    description,
  });

  return getAssetById(assetId);
}

export function addSyncRun(input: {
  recordId: string;
  target: SyncRun["target"];
  status: SyncRun["status"];
  externalRef?: string | null;
  payload?: Record<string, unknown>;
  message?: string;
}) {
  const db = getDb();
  const createdAt = nowIso();

  db.prepare(
    `
      INSERT INTO sync_runs (
        id, record_id, target, status, external_ref, payload, message, created_at, updated_at
      ) VALUES (
        @id, @record_id, @target, @status, @external_ref, @payload, @message, @created_at, @updated_at
      )
    `,
  ).run({
    id: createId("sync"),
    record_id: input.recordId,
    target: input.target,
    status: input.status,
    external_ref: input.externalRef || null,
    payload: JSON.stringify(input.payload || {}),
    message: input.message || "",
    created_at: createdAt,
    updated_at: createdAt,
  });
}
