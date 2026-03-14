import { NextResponse } from "next/server";
import { deleteTodo, getTodo, hardDeleteTodo, updateTodo } from "@/lib/todos";
import type { TodoPriority, TodoStatus } from "@/lib/types";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const existing = getTodo(id);
  if (!existing) {
    return NextResponse.json({ error: "待办不存在。" }, { status: 404 });
  }

  const body = (await request.json()) as {
    content?: string;
    priority?: TodoPriority;
    status?: TodoStatus;
    _hardDelete?: boolean;
  };

  if (body._hardDelete) {
    hardDeleteTodo(id);
    return NextResponse.json({ ok: true });
  }

  const todo = updateTodo(id, body);
  return NextResponse.json({ todo });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const existing = getTodo(id);
  if (!existing) {
    return NextResponse.json({ error: "待办不存在。" }, { status: 404 });
  }

  const todo = deleteTodo(id);
  return NextResponse.json({ ok: true, todo });
}
