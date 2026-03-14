import { NextResponse, type NextRequest } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { getDb } from "@/lib/db";
import { paths, appConfig } from "@/lib/config";

export const runtime = "nodejs";

export async function GET() {
  try {
    const db = getDb();
    const backupDir = path.join(appConfig.dataRoot, "backups");
    fs.mkdirSync(backupDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupFile = path.join(backupDir, `backup-${timestamp}.sqlite`);

    db.exec(`VACUUM INTO '${backupFile.replace(/'/g, "''")}'`);

    const buffer = fs.readFileSync(backupFile);

    try {
      fs.unlinkSync(backupFile);
    } catch { /* cleanup optional */ }

    return new Response(buffer, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="ai-signal-backup-${timestamp}.sqlite"`,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "备份失败" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "请上传备份文件" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    const header = buffer.slice(0, 16).toString("ascii");
    if (!header.startsWith("SQLite format 3")) {
      return NextResponse.json({ error: "无效的 SQLite 备份文件" }, { status: 400 });
    }

    const backupDir = path.join(appConfig.dataRoot, "backups");
    fs.mkdirSync(backupDir, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const currentBackup = path.join(backupDir, `pre-restore-${timestamp}.sqlite`);
    fs.copyFileSync(paths.dbFile, currentBackup);

    fs.writeFileSync(paths.dbFile, buffer);

    return NextResponse.json({
      ok: true,
      message: "数据库已恢复，请刷新页面。原数据库已备份至 backups 目录。",
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "恢复失败" },
      { status: 500 },
    );
  }
}
