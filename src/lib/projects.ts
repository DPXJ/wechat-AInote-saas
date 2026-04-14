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
  tags: string[];
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
    tags: Array.isArray(row.tags) ? row.tags : [],
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
    tags?: string[];
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
  if (fields.tags !== undefined) updates.tags = fields.tags;

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

type TaskRecordLinkRow = Database["public"]["Tables"]["project_task_records"]["Row"];
type RecordRow = Database["public"]["Tables"]["records"]["Row"];

/** 某条项目任务上关联的一条「已确认信源」 */
export interface TaskLinkedSource {
  linkId: string;
  taskId: string;
  recordId: string;
  title: string;
  sourceLabel: string;
  confirmedAt: string;
  linkedAt: string;
}

/** 按任务 id 聚合本项目下全部信源关联（用于面板一次拉取） */
export async function listTaskSourceLinksByProject(
  userId: string,
  projectId: string,
): Promise<Record<string, TaskLinkedSource[]>> {
  const project = await getProject(userId, projectId);
  if (!project) return {};

  const supabase = getSupabaseAdmin();
  const { data: taskRows } = await supabase
    .from("project_tasks")
    .select("id")
    .eq("user_id", userId)
    .eq("project_id", projectId);

  const taskIds = (taskRows || []).map((t) => (t as { id: string }).id);
  const out: Record<string, TaskLinkedSource[]> = {};
  for (const tid of taskIds) out[tid] = [];

  if (taskIds.length === 0) return out;

  const { data: links, error } = await supabase
    .from("project_task_records")
    .select("id, project_task_id, record_id, created_at, sort_order")
    .eq("user_id", userId)
    .in("project_task_id", taskIds)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    const missing =
      error.code === "42P01" || /does not exist/i.test(error.message || "");
    throw new Error(
      missing
        ? "数据库缺少 project_task_records 表：请执行 scripts/migrate-project-task-records.sql"
        : error.message,
    );
  }

  const rows = (links || []) as Pick<
    TaskRecordLinkRow,
    "id" | "project_task_id" | "record_id" | "created_at" | "sort_order"
  >[];
  if (rows.length === 0) return out;

  const recordIds = [...new Set(rows.map((r) => r.record_id))];
  const { data: recRows, error: recErr } = await supabase
    .from("records")
    .select("id, title, source_label, confirmed_at, deleted_at")
    .eq("user_id", userId)
    .in("id", recordIds);

  if (recErr) {
    throw new Error(recErr.message);
  }

  const byId = new Map((recRows || []).map((r) => [r.id, r as RecordRow]));

  for (const link of rows) {
    const rec = byId.get(link.record_id);
    if (!rec || rec.deleted_at || !rec.confirmed_at) continue;
    const item: TaskLinkedSource = {
      linkId: link.id,
      taskId: link.project_task_id,
      recordId: rec.id,
      title: rec.title,
      sourceLabel: rec.source_label,
      confirmedAt: rec.confirmed_at,
      linkedAt: link.created_at,
    };
    const list = out[link.project_task_id] ?? [];
    list.push(item);
    out[link.project_task_id] = list;
  }
  return out;
}

export async function linkTaskToSourceRecord(
  userId: string,
  projectId: string,
  taskId: string,
  recordId: string,
): Promise<TaskLinkedSource> {
  const project = await getProject(userId, projectId);
  if (!project) {
    throw new Error("项目不存在。");
  }

  const supabase = getSupabaseAdmin();
  const { data: taskRow } = await supabase
    .from("project_tasks")
    .select("id, project_id")
    .eq("id", taskId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!taskRow || (taskRow as { project_id: string }).project_id !== projectId) {
    throw new Error("任务不存在。");
  }

  const { data: recRow, error: recErr } = await supabase
    .from("records")
    .select("id, title, source_label, confirmed_at, deleted_at")
    .eq("id", recordId)
    .eq("user_id", userId)
    .maybeSingle();

  if (recErr) {
    const missing =
      recErr.code === "42703" || /confirmed_at/i.test(recErr.message || "");
    throw new Error(
      missing
        ? "数据库缺少 records.confirmed_at：请执行 scripts/migrate-project-records-sources.sql"
        : recErr.message,
    );
  }

  if (!recRow || (recRow as RecordRow).deleted_at) {
    throw new Error("记录不存在。");
  }
  const rec = recRow as RecordRow;
  if (!rec.confirmed_at) {
    throw new Error("请先将该记录确认为信源后再关联到任务。");
  }

  const { data: maxRow } = await supabase
    .from("project_task_records")
    .select("sort_order")
    .eq("user_id", userId)
    .eq("project_task_id", taskId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const sortOrder = (maxRow?.sort_order != null ? Number(maxRow.sort_order) : -1) + 1;
  const now = nowIso();
  const id = createId("ptrec");

  const { error: insErr } = await supabase.from("project_task_records").insert({
    id,
    user_id: userId,
    project_task_id: taskId,
    record_id: recordId,
    sort_order: sortOrder,
    created_at: now,
  });

  if (insErr) {
    const missing =
      insErr.code === "42P01" || /does not exist/i.test(insErr.message || "");
    if (missing) {
      throw new Error(
        "数据库缺少 project_task_records 表：请执行 scripts/migrate-project-task-records.sql",
      );
    }
    if (insErr.code === "23505") {
      throw new Error("该信源已关联到此任务。");
    }
    throw new Error(insErr.message);
  }

  return {
    linkId: id,
    taskId,
    recordId: rec.id,
    title: rec.title,
    sourceLabel: rec.source_label,
    confirmedAt: rec.confirmed_at,
    linkedAt: now,
  };
}

export async function unlinkTaskSourceRecord(
  userId: string,
  projectId: string,
  taskId: string,
  recordId: string,
): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { data: taskRow } = await supabase
    .from("project_tasks")
    .select("id")
    .eq("id", taskId)
    .eq("user_id", userId)
    .eq("project_id", projectId)
    .maybeSingle();

  if (!taskRow) {
    throw new Error("任务不存在。");
  }

  const { error } = await supabase
    .from("project_task_records")
    .delete()
    .eq("user_id", userId)
    .eq("project_task_id", taskId)
    .eq("record_id", recordId);
  if (error) {
    throw new Error(error.message);
  }
}

/**
 * 用勾选结果整体覆盖该任务上的信源关联；保存时会把尚未确认的资料自动标为已确认信源。
 */
export async function setTaskSourceRecords(
  userId: string,
  projectId: string,
  taskId: string,
  recordIds: string[],
): Promise<TaskLinkedSource[]> {
  const project = await getProject(userId, projectId);
  if (!project) {
    throw new Error("项目不存在。");
  }

  const supabase = getSupabaseAdmin();
  const { data: taskRow } = await supabase
    .from("project_tasks")
    .select("id, project_id")
    .eq("id", taskId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!taskRow || (taskRow as { project_id: string }).project_id !== projectId) {
    throw new Error("任务不存在。");
  }

  const uniqueIds = [...new Set(recordIds.map((id) => id.trim()).filter(Boolean))];

  if (uniqueIds.length === 0) {
    const { error: delErr } = await supabase
      .from("project_task_records")
      .delete()
      .eq("user_id", userId)
      .eq("project_task_id", taskId);
    if (delErr) {
      const missing =
        delErr.code === "42P01" || /does not exist/i.test(delErr.message || "");
      throw new Error(
        missing
          ? "数据库缺少 project_task_records 表：请执行 scripts/migrate-project-task-records.sql"
          : delErr.message,
      );
    }
    return [];
  }

  const { data: recRows, error: recListErr } = await supabase
    .from("records")
    .select("id, title, source_label, confirmed_at, deleted_at")
    .eq("user_id", userId)
    .in("id", uniqueIds);

  if (recListErr) {
    throw new Error(recListErr.message);
  }

  const found = new Map((recRows || []).map((r) => [r.id, r as RecordRow]));
  for (const id of uniqueIds) {
    const r = found.get(id);
    if (!r) {
      throw new Error("部分资料不存在。");
    }
    if (r.deleted_at) {
      throw new Error("回收站中的资料无法关联，请先恢复。");
    }
  }

  const now = nowIso();
  const needConfirm = uniqueIds.filter((id) => !found.get(id)!.confirmed_at);
  if (needConfirm.length > 0) {
    const { error: upErr } = await supabase
      .from("records")
      .update({ confirmed_at: now, updated_at: now })
      .eq("user_id", userId)
      .in("id", needConfirm)
      .is("confirmed_at", null);
    if (upErr) {
      const missing =
        upErr.code === "42703" || /confirmed_at/i.test(upErr.message || "");
      throw new Error(
        missing
          ? "数据库缺少 records.confirmed_at：请执行 scripts/migrate-project-records-sources.sql"
          : upErr.message,
      );
    }
    for (const id of needConfirm) {
      const r = found.get(id);
      if (r) r.confirmed_at = now;
    }
  }

  const { error: delAllErr } = await supabase
    .from("project_task_records")
    .delete()
    .eq("user_id", userId)
    .eq("project_task_id", taskId);

  if (delAllErr) {
    const missing =
      delAllErr.code === "42P01" || /does not exist/i.test(delAllErr.message || "");
    throw new Error(
      missing
        ? "数据库缺少 project_task_records 表：请执行 scripts/migrate-project-task-records.sql"
        : delAllErr.message,
    );
  }

  const inserts = uniqueIds.map((recordId, i) => ({
    id: createId("ptrec"),
    user_id: userId,
    project_task_id: taskId,
    record_id: recordId,
    sort_order: i,
    created_at: now,
  }));

  const { error: insErr } = await supabase.from("project_task_records").insert(inserts);
  if (insErr) {
    const missing =
      insErr.code === "42P01" || /does not exist/i.test(insErr.message || "");
    throw new Error(
      missing
        ? "数据库缺少 project_task_records 表：请执行 scripts/migrate-project-task-records.sql"
        : insErr.message,
    );
  }

  const out: TaskLinkedSource[] = [];
  let i = 0;
  for (const recordId of uniqueIds) {
    const r = found.get(recordId)!;
    const linkId = inserts[i].id;
    i += 1;
    out.push({
      linkId,
      taskId,
      recordId: r.id,
      title: r.title,
      sourceLabel: r.source_label,
      confirmedAt: r.confirmed_at!,
      linkedAt: now,
    });
  }
  return out;
}

/** 某条资料被哪些「项目 · 任务」引用（用于详情反向跳转） */
export type RecordTaskProjectLink = {
  projectId: string;
  projectName: string;
  taskId: string;
  taskPreview: string;
};

function previewTaskContent(content: string, maxLen = 72): string {
  const t = (content || "").replace(/\s+/g, " ").trim();
  if (!t) return "（无内容）";
  return t.length <= maxLen ? t : `${t.slice(0, maxLen)}…`;
}

export async function listRecordTaskProjectLinks(
  userId: string,
  recordId: string,
): Promise<RecordTaskProjectLink[]> {
  const supabase = getSupabaseAdmin();
  const { data: ptrRows, error: ptrErr } = await supabase
    .from("project_task_records")
    .select("project_task_id")
    .eq("user_id", userId)
    .eq("record_id", recordId);
  if (ptrErr || !ptrRows?.length) return [];

  const taskIds = [...new Set(ptrRows.map((r) => (r as { project_task_id: string }).project_task_id))];
  const { data: taskRows, error: taskErr } = await supabase
    .from("project_tasks")
    .select("id, content, project_id")
    .eq("user_id", userId)
    .in("id", taskIds);
  if (taskErr || !taskRows?.length) return [];

  const projectIds = [...new Set(taskRows.map((t) => (t as { project_id: string }).project_id))];
  const { data: projRows } = await supabase
    .from("projects")
    .select("id, name")
    .eq("user_id", userId)
    .in("id", projectIds);
  const projectNameById = new Map(
    (projRows || []).map((p) => [(p as { id: string }).id, String((p as { name: string }).name || "")]),
  );

  const out: RecordTaskProjectLink[] = [];
  for (const t of taskRows as { id: string; content: string; project_id: string }[]) {
    const name = projectNameById.get(t.project_id)?.trim() || "项目";
    out.push({
      projectId: t.project_id,
      projectName: name,
      taskId: t.id,
      taskPreview: previewTaskContent(t.content),
    });
  }
  out.sort((a, b) => {
    const c = a.projectName.localeCompare(b.projectName, "zh-CN");
    if (c !== 0) return c;
    return a.taskPreview.localeCompare(b.taskPreview, "zh-CN");
  });
  return out;
}
