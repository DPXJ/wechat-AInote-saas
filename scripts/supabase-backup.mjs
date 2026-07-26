#!/usr/bin/env node
import { createGzip } from "node:zlib";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createClient } from "@supabase/supabase-js";

const TABLES = [
  "records",
  "assets",
  "chunks",
  "sync_runs",
  "settings",
  "todos",
  "favorites",
  "projects",
  "project_tasks",
  "project_records",
  "project_task_records",
  "flash_memos",
];

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const text = fs.readFileSync(filePath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    value = value.replace(/^['"]|['"]$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile(path.resolve(".env.production"));
loadEnvFile(path.resolve(".env.local"));

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const backupDir = path.resolve(process.env.BACKUP_DIR || "backups");
await fsp.mkdir(backupDir, { recursive: true });

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function fetchAllRows(table) {
  const pageSize = 1000;
  let from = 0;
  const rows = [];

  while (true) {
    const to = from + pageSize - 1;
    const { data, error } = await supabase.from(table).select("*").range(from, to);
    if (error) {
      if (/relation .* does not exist/i.test(error.message)) {
        return { skipped: true, rows: [] };
      }
      throw new Error(`${table}: ${error.message}`);
    }
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }

  return { skipped: false, rows };
}

const startedAt = new Date();
const backup = {
  meta: {
    app: "AI 信迹",
    version: 1,
    createdAt: startedAt.toISOString(),
    supabaseUrl,
    tables: TABLES,
  },
  tables: {},
};

for (const table of TABLES) {
  const result = await fetchAllRows(table);
  backup.tables[table] = result.rows;
  const status = result.skipped ? "skipped" : `${result.rows.length} rows`;
  console.log(`[backup] ${table}: ${status}`);
}

const stamp = startedAt.toISOString().replace(/[:.]/g, "-");
const output = path.join(backupDir, `ai-xinji-supabase-${stamp}.json.gz`);
await pipeline(
  Readable.from([JSON.stringify(backup, null, 2)]),
  createGzip({ level: 9 }),
  fs.createWriteStream(output, { mode: 0o600 }),
);

console.log(`[backup] written ${output}`);
