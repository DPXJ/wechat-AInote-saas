import { getDb } from "@/lib/db";
import type { KnowledgeRecord, Todo, TodoPriority, TodoStatus } from "@/lib/types";
import { createId, nowIso } from "@/lib/utils";

type TodoRow = {
  id: string;
  record_id: string | null;
  content: string;
  priority: string;
  status: string;
  created_at: string;
  completed_at: string | null;
  updated_at: string;
};

function mapTodo(row: TodoRow): Todo {
  return {
    id: row.id,
    recordId: row.record_id,
    content: row.content,
    priority: row.priority as TodoPriority,
    status: row.status as TodoStatus,
    createdAt: row.created_at,
    completedAt: row.completed_at,
    updatedAt: row.updated_at,
  };
}

export function createTodo(input: {
  content: string;
  priority?: TodoPriority;
  recordId?: string | null;
}) {
  const db = getDb();
  const now = nowIso();
  const id = createId("todo");

  db.prepare(
    `INSERT INTO todos (id, record_id, content, priority, status, created_at, updated_at)
     VALUES (@id, @record_id, @content, @priority, 'pending', @created_at, @updated_at)`,
  ).run({
    id,
    record_id: input.recordId || null,
    content: input.content,
    priority: input.priority || "medium",
    created_at: now,
    updated_at: now,
  });

  return getTodo(id);
}

export function getTodo(id: string) {
  const db = getDb();
  const row = db.prepare(`SELECT * FROM todos WHERE id = ?`).get(id) as TodoRow | undefined;
  return row ? mapTodo(row) : null;
}

export function listTodos(opts?: {
  status?: TodoStatus;
  priority?: TodoPriority;
  limit?: number;
  offset?: number;
}) {
  const db = getDb();
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (opts?.status) {
    conditions.push("status = ?");
    params.push(opts.status);
  }
  if (opts?.priority) {
    conditions.push("priority = ?");
    params.push(opts.priority);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = opts?.limit ?? 50;
  const offset = opts?.offset ?? 0;

  const { total } = db
    .prepare(`SELECT count(*) as total FROM todos ${where}`)
    .get(...params) as { total: number };

  const rows = db
    .prepare(
      `SELECT * FROM todos ${where}
       ORDER BY
         CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
         CASE status WHEN 'pending' THEN 0 ELSE 1 END,
         datetime(created_at) DESC
       LIMIT ? OFFSET ?`,
    )
    .all(...params, limit, offset) as TodoRow[];

  return { todos: rows.map(mapTodo), total };
}

export function updateTodo(
  id: string,
  fields: { content?: string; priority?: TodoPriority; status?: TodoStatus },
) {
  const db = getDb();
  const sets: string[] = ["updated_at = @updated_at"];
  const values: Record<string, string | null> = {
    id,
    updated_at: nowIso(),
  };

  if (fields.content !== undefined) {
    sets.push("content = @content");
    values.content = fields.content;
  }
  if (fields.priority !== undefined) {
    sets.push("priority = @priority");
    values.priority = fields.priority;
  }
  if (fields.status !== undefined) {
    sets.push("status = @status");
    values.status = fields.status;
    if (fields.status === "done") {
      sets.push("completed_at = @completed_at");
      values.completed_at = nowIso();
    } else {
      sets.push("completed_at = NULL");
    }
  }

  db.prepare(`UPDATE todos SET ${sets.join(", ")} WHERE id = @id`).run(values);
  return getTodo(id);
}

export function deleteTodo(id: string) {
  const db = getDb();
  db.prepare(`DELETE FROM todos WHERE id = ?`).run(id);
}

export function extractTodosFromRecord(record: KnowledgeRecord) {
  if (record.actionItems.length === 0) return;
  for (const item of record.actionItems) {
    createTodo({
      content: item,
      priority: "medium",
      recordId: record.id,
    });
  }
}

export function getTodoStats() {
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);

  const { total } = db
    .prepare(`SELECT count(*) as total FROM todos`)
    .get() as { total: number };
  const { pending } = db
    .prepare(`SELECT count(*) as pending FROM todos WHERE status = 'pending'`)
    .get() as { pending: number };
  const { todayCount } = db
    .prepare(`SELECT count(*) as todayCount FROM todos WHERE date(created_at) = ?`)
    .get(today) as { todayCount: number };
  const { urgentCount } = db
    .prepare(`SELECT count(*) as urgentCount FROM todos WHERE status = 'pending' AND priority = 'urgent'`)
    .get() as { urgentCount: number };

  return {
    totalTodos: total,
    pendingTodos: pending,
    todayTodos: todayCount,
    urgentTodos: urgentCount,
  };
}
