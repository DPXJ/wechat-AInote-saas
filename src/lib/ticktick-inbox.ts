import nodemailer from "nodemailer";
import { getIntegrationSettings } from "@/lib/settings";

/**
 * 通过 SMTP 向滴答清单「邮件收件箱」投递一封任务邮件（待办、项目任务等共用）。
 */
export async function sendToTickTickInbox(
  userId: string,
  options: { subject: string; textBody: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
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

  try {
    await transporter.sendMail({
      from: settings.smtpFrom || settings.smtpUser,
      to: settings.tickTickInboxEmail,
      subject: options.subject,
      text: options.textBody,
    });
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "未知错误";
    return { ok: false, error: msg };
  }
}

export function formatTimeBeijing(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false });
}

export function tickTickPriorityLabel(priority: string) {
  return (
    ({ urgent: "紧急", high: "高", medium: "中", low: "低" } as Record<string, string>)[priority] || "中"
  );
}
