import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { requireUserId } from "@/lib/supabase/server";
import { getIntegrationSettings } from "@/lib/settings";
import { getTodo, updateTodo } from "@/lib/todos";
import { nowIso } from "@/lib/utils";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const todo = await getTodo(userId, id);
    if (!todo) {
      return NextResponse.json({ error: "待办不存在。" }, { status: 404 });
    }

    const settings = await getIntegrationSettings(userId);

    if (!settings.smtpHost || !settings.smtpUser || !settings.smtpPass) {
      return NextResponse.json({ error: "SMTP 未配置，请先在设置中完成邮箱配置。" }, { status: 400 });
    }
    if (!settings.tickTickInboxEmail) {
      return NextResponse.json({ error: "滴答清单收件邮箱未配置。" }, { status: 400 });
    }

    const port = Number(settings.smtpPort) || 587;
    const isImplicitTLS = port === 465;
    const transporter = nodemailer.createTransport({
      host: settings.smtpHost,
      port,
      secure: isImplicitTLS || settings.smtpSecure,
      auth: { user: settings.smtpUser, pass: settings.smtpPass },
      tls: { rejectUnauthorized: false },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
    });

    const priorityLabel = { urgent: "紧急", high: "高", medium: "中", low: "低" }[todo.priority] || "中";

    function toBeijingTime(iso: string) {
      const d = new Date(iso);
      return d.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false });
    }

    await transporter.sendMail({
      from: settings.smtpFrom || settings.smtpUser,
      to: settings.tickTickInboxEmail,
      subject: `[AI 信迹] ${todo.content}`,
      text: [
        `待办内容：${todo.content}`,
        `优先级：${priorityLabel}`,
        `创建时间：${toBeijingTime(todo.createdAt)}`,
        todo.recordId ? `来源记录 ID：${todo.recordId}` : "",
      ].filter(Boolean).join("\n"),
    });

    const synced = nowIso();
    const updated = await updateTodo(userId, id, { syncedAt: synced });

    return NextResponse.json({ ok: true, todo: updated, message: "已同步到滴答清单。" });
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized") {
      return NextResponse.json({ error: "未登录，请刷新页面重试" }, { status: 401 });
    }
    const msg = e instanceof Error ? e.message : "未知错误";
    console.error("[Todo Sync Error]", msg);
    if (/ECONNREFUSED|ETIMEDOUT|ENOTFOUND/i.test(msg)) {
      return NextResponse.json({ error: "SMTP 连接失败，请检查网络和邮箱配置" }, { status: 500 });
    }
    if (/Invalid login|auth|535|Authentication failed/i.test(msg)) {
      return NextResponse.json({ error: "邮箱登录失败，请检查 SMTP 账号和授权码" }, { status: 500 });
    }
    return NextResponse.json({ error: `同步失败：${msg}` }, { status: 500 });
  }
}
