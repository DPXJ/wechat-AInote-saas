import { NextResponse } from "next/server";
import { getKnowledgeRecord } from "@/lib/records";

export const runtime = "nodejs";

function recordToMarkdown(record: NonNullable<ReturnType<typeof getKnowledgeRecord>>) {
  const lines: string[] = [];
  lines.push(`# ${record.title}`);
  lines.push("");
  lines.push(`> 来源: ${record.sourceLabel} · 类型: ${record.recordType} · 创建于: ${record.createdAt}`);
  lines.push("");

  if (record.summary) {
    lines.push("## 摘要");
    lines.push("");
    lines.push(record.summary);
    lines.push("");
  }

  if (record.contentText) {
    lines.push("## 正文");
    lines.push("");
    lines.push(record.contentText);
    lines.push("");
  }

  if (record.contextNote) {
    lines.push("## 补充说明");
    lines.push("");
    lines.push(record.contextNote);
    lines.push("");
  }

  if (record.keywords.length > 0) {
    lines.push("## 关键词");
    lines.push("");
    lines.push(record.keywords.map((k) => `\`${k}\``).join(" · "));
    lines.push("");
  }

  if (record.actionItems.length > 0) {
    lines.push("## 行动项");
    lines.push("");
    for (const item of record.actionItems) {
      lines.push(`- [ ] ${item}`);
    }
    lines.push("");
  }

  if (record.extractedText) {
    lines.push("## 抽取内容");
    lines.push("");
    lines.push(record.extractedText);
    lines.push("");
  }

  if (record.assets.length > 0) {
    lines.push("## 附件");
    lines.push("");
    for (const asset of record.assets) {
      lines.push(`- ${asset.originalName} (${(asset.byteSize / 1024).toFixed(1)} KB)`);
      if (asset.description) lines.push(`  - 描述: ${asset.description}`);
      if (asset.ocrText) lines.push(`  - OCR: ${asset.ocrText.slice(0, 200)}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

function recordToHtml(record: NonNullable<ReturnType<typeof getKnowledgeRecord>>) {
  const md = recordToMarkdown(record);
  const escaped = md
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>");

  return `<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${record.title} - AI 信迹</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif; max-width: 800px; margin: 40px auto; padding: 0 20px; line-height: 1.8; color: #333; }
    h1 { color: #111; border-bottom: 2px solid #eee; padding-bottom: 8px; }
    h2 { color: #444; margin-top: 24px; }
    blockquote { border-left: 3px solid #ddd; margin: 16px 0; padding: 8px 16px; color: #666; }
    code { background: #f5f5f5; padding: 2px 6px; border-radius: 4px; font-size: 0.9em; }
    @media print { body { margin: 20px; } }
  </style>
</head>
<body>
  <div>${escaped}</div>
</body>
</html>`;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const format = new URL(request.url).searchParams.get("format") || "markdown";
  const record = getKnowledgeRecord(id);

  if (!record) {
    return NextResponse.json({ error: "资料不存在" }, { status: 404 });
  }

  if (format === "html") {
    const html = recordToHtml(record);
    return new Response(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(record.title)}.html"`,
      },
    });
  }

  const md = recordToMarkdown(record);
  return new Response(md, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(record.title)}.md"`,
    },
  });
}
