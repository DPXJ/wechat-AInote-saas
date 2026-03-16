import nodemailer from "nodemailer";
import { getIntegrationSettings } from "@/lib/settings";
import { getTodo, updateTodo } from "@/lib/todos";
import { nowIso } from "@/lib/utils";
import type { Todo } from "@/lib/types";

export async function syncTodoToTickTick(userId: string, todoId: string): Promise<{ ok: true; todo: Todo } | { ok: false; error: string }> {
  const todo = await getTodo(userId, todoId);
  if (!todo) {
    return { ok: false, error: "待办不存在。" };
  }

  const settings = await getIntegrationSettings(userId);
  if (!settings.smtpHost || !settings.smtpUser || !settings.smtpPass) {
    return { ok: false, error: "SMTP 未配置，请先在设置中完成邮箱配置。" };
  }
  if (!settings.tickTickInboxEmail) {
    return { ok: false, error: "滴答清单收件邮箱未配置。" };
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

  try {
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
    const updated = await updateTodo(userId, todoId, { syncedAt: synced });
    return { ok: true, todo: updated! };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "未知错误";
    return { ok: false, error: msg };
  }
}
