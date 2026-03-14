import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { KnowledgeRecord, Todo, TodoPriority, TodoStatus } from "@/lib/types";
import { createId, nowIso } from "@/lib/utils";

function mapTodo(row: Record<string, unknown>): Todo {
  return {
    id: row.id as string,
    recordId: (row.record_id as string) || null,
    content: row.content as string,
    priority: row.priority as TodoPriority,
    status: row.status as TodoStatus,
    createdAt: row.created_at as string,
    completedAt: (row.completed_at as string) || null,
    updatedAt: row.updated_at as string,
    deletedAt: (row.deleted_at as string) || null,
    syncedAt: (row.synced_at as string) || null,
  };
}

export async function createTodo(
  userId: string,
  input: { content: string; priority?: TodoPriority; recordId?: string | null },
) {
  const now = nowIso();
  const id = createId("todo");

  await getSupabaseAdmin().from("todos").insert({
    id,
    user_id: userId,
    record_id: input.recordId || null,
    content: input.content,
    priority: input.priority || "medium",
    status: "pending",
    created_at: now,
    updated_at: now,
  });

  return getTodo(userId, id);
}

export async function getTodo(userId: string, id: string) {
  const { data } = await getSupabaseAdmin()
    .from("todos")
    .select("*")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  return data ? mapTodo(data) : null;
}

export async function listTodos(
  userId: string,
  opts?: { status?: TodoStatus; priority?: TodoPriority; limit?: number; offset?: number },
) {
  const supabase = getSupabaseAdmin();
  const limit = opts?.limit ?? 50;
  const offset = opts?.offset ?? 0;

  let countQuery = supabase
    .from("todos")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  let dataQuery = supabase
    .from("todos")
    .select("*")
    .eq("user_id", userId);

  if (opts?.status === "deleted") {
    countQuery = countQuery.eq("status", "deleted");
    dataQuery = dataQuery.eq("status", "deleted");
  } else if (opts?.status) {
    countQuery = countQuery.eq("status", opts.status).neq("status", "deleted");
    dataQuery = dataQuery.eq("status", opts.status).neq("status", "deleted");
  } else {
    countQuery = countQuery.neq("status", "deleted");
    dataQuery = dataQuery.neq("status", "deleted");
  }

  if (opts?.priority) {
    countQuery = countQuery.eq("priority", opts.priority);
    dataQuery = dataQuery.eq("priority", opts.priority);
  }

  const { count: total } = await countQuery;

  const { data: rows } = await dataQuery
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  return { todos: (rows || []).map(mapTodo), total: total ?? 0 };
}

export async function updateTodo(
  userId: string,
  id: string,
  fields: { content?: string; priority?: TodoPriority; status?: TodoStatus; syncedAt?: string },
) {
  const updates: Record<string, unknown> = { updated_at: nowIso() };

  if (fields.content !== undefined) updates.content = fields.content;
  if (fields.priority !== undefined) updates.priority = fields.priority;
  if (fields.syncedAt !== undefined) updates.synced_at = fields.syncedAt;
  if (fields.status !== undefined) {
    updates.status = fields.status;
    if (fields.status === "done") {
      updates.completed_at = nowIso();
    } else if (fields.status === "pending") {
      updates.completed_at = null;
      updates.deleted_at = null;
    } else if (fields.status === "deleted") {
      updates.deleted_at = nowIso();
    }
  }

  await getSupabaseAdmin()
    .from("todos")
    .update(updates)
    .eq("id", id)
    .eq("user_id", userId);

  return getTodo(userId, id);
}

export async function deleteTodo(userId: string, id: string) {
  return updateTodo(userId, id, { status: "deleted" });
}

export async function hardDeleteTodo(userId: string, id: string) {
  await getSupabaseAdmin().from("todos").delete().eq("id", id).eq("user_id", userId);
}

export async function restoreTodo(userId: string, id: string) {
  return updateTodo(userId, id, { status: "pending" });
}

export async function extractTodosFromRecord(userId: string, record: KnowledgeRecord) {
  if (record.actionItems.length === 0) return;
  for (const item of record.actionItems) {
    await createTodo(userId, {
      content: item,
      priority: "medium",
      recordId: record.id,
    });
  }
}

export async function getTodoStats(userId: string) {
  const supabase = getSupabaseAdmin();
  const today = new Date().toISOString().slice(0, 10);

  const { count: total } = await supabase
    .from("todos")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .neq("status", "deleted");

  const { count: pending } = await supabase
    .from("todos")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", "pending");

  const { count: todayCount } = await supabase
    .from("todos")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .neq("status", "deleted")
    .gte("created_at", `${today}T00:00:00`)
    .lt("created_at", `${today}T23:59:59.999`);

  const { count: urgentCount } = await supabase
    .from("todos")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", "pending")
    .eq("priority", "urgent");

  return {
    totalTodos: total ?? 0,
    pendingTodos: pending ?? 0,
    todayTodos: todayCount ?? 0,
    urgentTodos: urgentCount ?? 0,
  };
}
