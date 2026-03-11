import { NextResponse } from "next/server";
import { createKnowledgeRecord, listKnowledgeRecords } from "@/lib/records";
import { getIntegrationSettings } from "@/lib/settings";
import { syncRecord } from "@/lib/sync";
import type { RecordType, StoredUpload, SyncTarget } from "@/lib/types";

export const runtime = "nodejs";

const explicitTimePattern =
  /(\d{4}[/-]\d{1,2}[/-]\d{1,2}|\d{1,2}月\d{1,2}日|\d{1,2}[:：]\d{2}|(?:今|明|后)?(?:早上|上午|中午|下午|傍晚|晚上|今晚|今早|凌晨)?\s*(?:\d{1,2}|[零〇一二两三四五六七八九十]{1,3})\s*(?:点半|点钟|点|时)(?:\s*(?:半|整|[0-5]?\d分))?|今天|明天|后天|今晚|今早|今天下午|今天晚上|本周|下周|周[一二三四五六日天]|星期[一二三四五六日天]|月底|月初|前完成|前提交|前回复)/;

function hasExplicitTime(text: string) {
  return explicitTimePattern.test(text);
}

function hasTodoIntent(text: string) {
  return /(提交|跟进|确认|安排|完成|联系|回复|处理|补充|准备|沟通|开会|汇报|发送|拆解|调研|计划|提醒)/.test(
    text,
  );
}

function canAutoSyncNotion() {
  const settings = getIntegrationSettings();
  return Boolean(settings.notionToken && settings.notionParentPageId);
}

function canAutoSyncTickTick() {
  const settings = getIntegrationSettings();
  return Boolean(
    settings.smtpHost &&
      settings.smtpUser &&
      settings.smtpPass &&
      settings.smtpFrom &&
      settings.tickTickInboxEmail,
  );
}

function shouldAutoSyncTickTick(record: {
  contentText: string;
  extractedText: string;
  contextNote: string;
  actionItems: string[];
}) {
  const sourceText = [record.contentText, record.extractedText, record.contextNote]
    .filter(Boolean)
    .join("\n");

  return (
    hasExplicitTime(sourceText) &&
    (hasTodoIntent(sourceText) || record.actionItems.length > 0)
  );
}

async function runAutoSync(recordId: string, target: SyncTarget) {
  try {
    await syncRecord(recordId, target);
    return {
      target,
      status: "synced" as const,
      message:
        target === "notion"
          ? "已自动同步到 Notion。"
          : "识别到明确时间，已自动投递到滴答清单。",
    };
  } catch (error) {
    return {
      target,
      status: "failed" as const,
      message: error instanceof Error ? error.message : "自动同步失败。",
    };
  }
}

export async function GET() {
  return NextResponse.json({ records: listKnowledgeRecords() });
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const title = String(formData.get("title") || "");
  const sourceLabel = String(formData.get("sourceLabel") || "");
  const contextNote = String(formData.get("contextNote") || "");
  const contentText = String(formData.get("contentText") || "");
  const recordTypeHint = String(formData.get("recordTypeHint") || "") as RecordType | "";
  const fileEntries = formData
    .getAll("files")
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);

  if (!contentText.trim() && fileEntries.length === 0) {
    return NextResponse.json(
      { error: "至少提供一段文本，或上传一个附件。" },
      { status: 400 },
    );
  }

  const uploads: StoredUpload[] = await Promise.all(
    fileEntries.map(async (file) => ({
      originalName: file.name,
      mimeType: file.type || "application/octet-stream",
      byteSize: file.size,
      buffer: Buffer.from(await file.arrayBuffer()),
    })),
  );

  const record = await createKnowledgeRecord(
    {
      title,
      sourceLabel,
      contextNote,
      contentText,
      recordTypeHint: recordTypeHint || undefined,
    },
    uploads,
  );

  const autoSync: Array<{
    target: SyncTarget;
    status: "synced" | "failed" | "skipped";
    message: string;
  }> = [];

  if (record && canAutoSyncNotion()) {
    autoSync.push(await runAutoSync(record.id, "notion"));
  }

  if (record && canAutoSyncTickTick()) {
    if (shouldAutoSyncTickTick(record)) {
      autoSync.push(await runAutoSync(record.id, "ticktick-email"));
    } else {
      autoSync.push({
        target: "ticktick-email",
        status: "skipped",
        message: "未识别出明确时间，本次未自动生成滴答待办。",
      });
    }
  }

  return NextResponse.json({ record, autoSync });
}
