import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/supabase/server";
import { createTodo, listTodos } from "@/lib/todos";
import type { TodoPriority, TodoStatus } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const userId = await requireUserId();
    const url = new URL(request.url);
    const status = (url.searchParams.get("status") || undefined) as TodoStatus | undefined;
    const priority = (url.searchParams.get("priority") || undefined) as TodoPriority | undefined;
    const limit = Math.min(Number(url.searchParams.get("limit")) || 50, 200);
    const offset = Math.max(Number(url.searchParams.get("offset")) || 0, 0);

    const result = await listTodos(userId, { status, priority, limit, offset });
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized") {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    throw e;
  }
}

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const body = (await request.json()) as {
      content?: string;
      priority?: TodoPriority;
      recordId?: string;
    };

    if (!body.content?.trim()) {
      return NextResponse.json({ error: "内容不能为空。" }, { status: 400 });
    }

    const todo = await createTodo(userId, {
      content: body.content.trim(),
      priority: body.priority,
      recordId: body.recordId,
    });

    return NextResponse.json({ todo });
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized") {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    throw e;
  }
}
