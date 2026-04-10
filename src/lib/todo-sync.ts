import { sendToTickTickInbox, formatTimeBeijing, tickTickPriorityLabel } from "@/lib/ticktick-inbox";
import { getTodo, updateTodo } from "@/lib/todos";
import { nowIso } from "@/lib/utils";
import type { Todo } from "@/lib/types";

export async function syncTodoToTickTick(userId: string, todoId: string): Promise<{ ok: true; todo: Todo } | { ok: false; error: string }> {
  const todo = await getTodo(userId, todoId);
  if (!todo) {
    return { ok: false, error: "待办不存在。" };
  }

  const priorityLabel = tickTickPriorityLabel(todo.priority);
  const sent = await sendToTickTickInbox(userId, {
    subject: `[AI 信迹] ${todo.content}`,
    textBody: [
      `待办内容：${todo.content}`,
      `优先级：${priorityLabel}`,
      `创建时间：${formatTimeBeijing(todo.createdAt)}`,
      todo.recordId ? `来源记录 ID：${todo.recordId}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
  });

  if (!sent.ok) {
    return { ok: false, error: sent.error };
  }

  const synced = nowIso();
  const updated = await updateTodo(userId, todoId, { syncedAt: synced });
  return { ok: true, todo: updated! };
}
