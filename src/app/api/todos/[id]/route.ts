import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/supabase/server";
import { deleteTodo, getTodo, hardDeleteTodo, updateTodo } from "@/lib/todos";
import type { TodoPriority, TodoStatus } from "@/lib/types";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const existing = await getTodo(userId, id);
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
      await hardDeleteTodo(userId, id);
      return NextResponse.json({ ok: true });
    }

    const todo = await updateTodo(userId, id, body);
    return NextResponse.json({ todo });
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized") {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    throw e;
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const existing = await getTodo(userId, id);
    if (!existing) {
      return NextResponse.json({ error: "待办不存在。" }, { status: 404 });
    }

    const todo = await deleteTodo(userId, id);
    return NextResponse.json({ ok: true, todo });
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized") {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    throw e;
  }
}
