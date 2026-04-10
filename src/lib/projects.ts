import { sendToTickTickInbox, formatTimeBeijing, tickTickPriorityLabel } from "@/lib/ticktick-inbox";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import type { TodoPriority } from "@/lib/types";
import { createId, nowIso } from "@/lib/utils";

type ProjectRow = Database["public"]["Tables"]["projects"]["Row"];
type TaskRow = Database["public"]["Tables"]["project_tasks"]["Row"];

export type ProjectTaskStatus = "pending" | "done";

export interface Project {
  id: string;
  name: string;
  description: string;
  archived: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  /** 列表汇总：可选 */
  doneCount?: number;
  totalTasks?: number;
}

export interface ProjectTask {
  id: string;
  projectId: string;
  content: string;
  status: ProjectTaskStatus;
  priority: TodoPriority;
  dueAt: string | null;
  sortOrder: number;
  syncedAt: string | null;
  /** 勾选完成时写入，用于「已完成」时间线；未跑迁移时可为空，前端用 updatedAt 兜底 */
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

function mapProject(row: ProjectRow, stats?: { done: number; total: number }): Project {
  return {
    id: row.id,
    name: row.name,
    description: row.description || "",
    archived: Boolean(row.archived),
    sortOrder: Number(row.sort_order),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    doneCount: stats?.done,
    totalTasks: stats?.total,
  };
}

function mapTask(row: TaskRow): ProjectTask {
  return {
    id: row.id,
    projectId: row.project_id,
    content: row.content,
    status: row.status as ProjectTaskStatus,
    priority: row.priority as TodoPriority,
    dueAt: row.due_at,
    sortOrder: Number(row.sort_order),
    syncedAt: row.synced_at,
    completedAt: row.completed_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listProjects(userId: string): Promise<Project[]> {
  const supabase = getSupabaseAdmin();
  const { data: rows } = await supabase
    .from("projects")
    .select("*")
    .eq("user_id", userId)
    .eq("archived", false)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });

  const projects = (rows || []) as ProjectRow[];
  if (projects.length === 0) return [];

  const ids = projects.map((p) => p.id);
  const { data: taskRows } = await supabase
    .from("project_tasks")
    .select("project_id, status")
    .eq("user_id", userId)
    .in("project_id", ids);

  const byProject = new Map<string, { done: number; total: number }>();
  for (const r of taskRows || []) {
    const pid = (r as { project_id: string; status: string }).project_id;
    const st = (r as { project_id: string; status: string }).status;
    const cur = byProject.get(pid) || { done: 0, total: 0 };
    cur.total += 1;
    if (st === "done") cur.done += 1;
    byProject.set(pid, cur);
  }

  return projects.map((row) => {
    const s = byProject.get(row.id);
    return mapProject(row, s ? { done: s.done, total: s.total } : { done: 0, total: 0 });
  });
}

export async function getProject(userId: string, projectId: string): Promise<Project | null> {
  const supabase = getSupabaseAdmin();
  const { data: row } = await supabase
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!row) return null;
  return mapProject(row as ProjectRow);
}

export async function createProject(
  userId: string,
  input: { name: string; description?: string },
): Promise<Project> {
  const supabase = getSupabaseAdmin();
  const now = nowIso();
  const id = createId("prj");
  const { data: maxRow } = await supabase
    .from("projects")
    .select("sort_order")
    .eq("user_id", userId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const sortOrder = (maxRow?.sort_order != null ? Number(maxRow.sort_order) : -1) + 1;

  const { error: insertErr } = await supabase.from("projects").insert({
    id,
    user_id: userId,
    name: input.name.trim(),
    description: (input.description || "").trim(),
    archived: false,
    sort_order: sortOrder,
    created_at: now,
    updated_at: now,
  });
  if (insertErr) {
    const missing =
      insertErr.code === "42P01" || /does not exist/i.test(insertErr.message || "");
    throw new Error(
      missing
        ? "数据库缺少 projects 表：请在 Supabase SQL 中执行一次 scripts/migrate-add-projects.sql"
        : `创建项目失败：${insertErr.message}`,
    );
  }

  const created = await getProject(userId, id);
  if (!created) {
    throw new Error("创建项目后无法读取记录，请检查 Supabase 配置与 RLS。");
  }
  return created;
}

export async function updateProject(
  userId: string,
  projectId: string,
  fields: { name?: string; description?: string; archived?: boolean; sortOrder?: number },
): Promise<Project | null> {
  const supabase = getSupabaseAdmin();
  const updates: Record<string, unknown> = { updated_at: nowIso() };
  if (fields.name !== undefined) updates.name = fields.name.trim();
  if (fields.description !== undefined) updates.description = fields.description.trim();
  if (fields.archived !== undefined) updates.archived = fields.archived;
  if (fields.sortOrder !== undefined) updates.sort_order = fields.sortOrder;

  await supabase.from("projects").update(updates).eq("id", projectId).eq("user_id", userId);
  return getProject(userId, projectId);
}

export async function deleteProject(userId: string, projectId: string): Promise<void> {
  await getSupabaseAdmin().from("projects").delete().eq("id", projectId).eq("user_id", userId);
}

export async function listProjectTasks(userId: string, projectId: string): Promise<ProjectTask[]> {
  const supabase = getSupabaseAdmin();
  const { data: rows } = await supabase
    .from("project_tasks")
    .select("*")
    .eq("user_id", userId)
    .eq("project_id", projectId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  return ((rows || []) as TaskRow[]).map(mapTask);
}

export async function createProjectTask(
  userId: string,
  projectId: string,
  input: { content: string; priority?: TodoPriority; dueAt?: string | null },
): Promise<ProjectTask | null> {
  const project = await getProject(userId, projectId);
  if (!project) return null;

  const supabase = getSupabaseAdmin();
  const now = nowIso();
  const id = createId("ptsk");
  const { data: maxRow } = await supabase
    .from("project_tasks")
    .select("sort_order")
    .eq("user_id", userId)
    .eq("project_id", projectId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const sortOrder = (maxRow?.sort_order != null ? Number(maxRow.sort_order) : -1) + 1;

  const { error: insertErr } =   await supabase.from("project_tasks").insert({
    id,
    user_id: userId,
    project_id: projectId,
    content: input.content.trim(),
    status: "pending",
    priority: input.priority || "medium",
    due_at: input.dueAt || null,
    sort_order: sortOrder,
    synced_at: null,
    created_at: now,
    updated_at: now,
  });
  if (insertErr) {
    const missing =
      insertErr.code === "42P01" || /does not exist/i.test(insertErr.message || "");
    throw new Error(
      missing
        ? "数据库缺少 project_tasks 表：请执行 scripts/migrate-add-projects.sql"
        : `创建任务失败：${insertErr.message}`,
    );
  }

  const { data: row } = await supabase
    .from("project_tasks")
    .select("*")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  return row ? mapTask(row as TaskRow) : null;
}

export async function updateProjectTask(
  userId: string,
  taskId: string,
  fields: {
    content?: string;
    status?: ProjectTaskStatus;
    priority?: TodoPriority;
    dueAt?: string | null;
    sortOrder?: number;
    syncedAt?: string | null;
  },
  scopeProjectId?: string,
): Promise<ProjectTask | null> {
  const supabase = getSupabaseAdmin();
  const now = nowIso();
  const updates: Record<string, unknown> = { updated_at: now };
  if (fields.content !== undefined) updates.content = fields.content.trim();
  if (fields.status !== undefined) {
    updates.status = fields.status;
    // 不在此写入 completed_at：早期创建的 project_tasks 表可能没有该列（CREATE TABLE IF NOT EXISTS 不会补列），
    // 写入会导致 PostgREST 报错。完成时间由 updated_at 兜底，界面与 completedDayKey 已兼容。
    // 若需单独「完成时刻」列，在 Supabase 执行 scripts/migrate-add-projects.sql 末尾的 ALTER 后再视需要恢复写入。
  }
  if (fields.priority !== undefined) updates.priority = fields.priority;
  if (fields.dueAt !== undefined) updates.due_at = fields.dueAt;
  if (fields.sortOrder !== undefined) updates.sort_order = fields.sortOrder;
  if (fields.syncedAt !== undefined) updates.synced_at = fields.syncedAt;

  let upd = supabase.from("project_tasks").update(updates).eq("id", taskId).eq("user_id", userId);
  if (scopeProjectId) upd = upd.eq("project_id", scopeProjectId);
  const { error: updErr } = await upd;
  if (updErr) {
    throw new Error(updErr.message);
  }

  let sel = supabase
    .from("project_tasks")
    .select("*")
    .eq("id", taskId)
    .eq("user_id", userId);
  if (scopeProjectId) sel = sel.eq("project_id", scopeProjectId);
  const { data: rows, error: selErr } = await sel.limit(1);
  if (selErr) {
    throw new Error(selErr.message);
  }
  const row = rows?.[0];
  return row ? mapTask(row as TaskRow) : null;
}

export async function deleteProjectTask(
  userId: string,
  taskId: string,
  projectId?: string,
): Promise<void> {
  let q = getSupabaseAdmin().from("project_tasks").delete().eq("id", taskId).eq("user_id", userId);
  if (projectId) q = q.eq("project_id", projectId);
  await q;
}

async function getProjectTask(userId: string, taskId: string): Promise<TaskRow | null> {
  const { data } = await getSupabaseAdmin()
    .from("project_tasks")
    .select("*")
    .eq("id", taskId)
    .eq("user_id", userId)
    .maybeSingle();
  return (data ?? null) as TaskRow | null;
}

export async function syncProjectTaskToTickTick(
  userId: string,
  taskId: string,
): Promise<{ ok: true; task: ProjectTask } | { ok: false; error: string }> {
  const row = await getProjectTask(userId, taskId);
  if (!row) {
    return { ok: false, error: "任务不存在。" };
  }
  const project = await getProject(userId, row.project_id);
  if (!project) {
    return { ok: false, error: "项目不存在。" };
  }

  const priorityLabel = tickTickPriorityLabel(row.priority);
  const lines = [
    `项目：${project.name}`,
    `任务：${row.content}`,
    `优先级：${priorityLabel}`,
    `创建时间：${formatTimeBeijing(row.created_at)}`,
    row.due_at ? `截止：${formatTimeBeijing(row.due_at)}（北京时间）` : "",
    `任务 ID：${row.id}`,
  ].filter(Boolean);

  const sent = await sendToTickTickInbox(userId, {
    subject: `[AI信迹·项目] ${project.name} · ${row.content.slice(0, 60)}${row.content.length > 60 ? "…" : ""}`,
    textBody: lines.join("\n"),
  });

  if (!sent.ok) {
    return { ok: false, error: sent.error };
  }

  const synced = nowIso();
  const task = await updateProjectTask(userId, taskId, { syncedAt: synced }, row.project_id);
  if (!task) {
    return { ok: false, error: "更新同步状态失败。" };
  }
  return { ok: true, task };
}
