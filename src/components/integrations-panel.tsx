"use client";

import { useState } from "react";
import type { IntegrationSettings, IntegrationStatus } from "@/lib/types";

type ActionTarget = "notion" | "smtp" | "ticktick-email" | "oss";

const actionLabels: Record<ActionTarget, string> = {
  notion: "测试 Notion",
  smtp: "测试 SMTP",
  "ticktick-email": "发送滴答测试邮件",
  oss: "测试 OSS",
};

export function IntegrationsPanel({
  initialSettings,
  initialStatus,
}: {
  initialSettings: IntegrationSettings;
  initialStatus: IntegrationStatus;
}) {
  const [settings, setSettings] = useState(initialSettings);
  const [status, setStatus] = useState(initialStatus);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<ActionTarget | "">("");

  function updateField<Key extends keyof IntegrationSettings>(
    key: Key,
    value: IntegrationSettings[Key],
  ) {
    setSettings((current) => ({
      ...current,
      [key]: value,
    }));
  }

  async function refreshStatus() {
    const statusResponse = await fetch("/api/integrations");
    const statusPayload = await statusResponse.json();
    setStatus(statusPayload.status);
  }

  async function saveSettings() {
    setSaving(true);
    setMessage("正在保存配置...");

    const response = await fetch("/api/settings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(settings),
    });
    const payload = await response.json();

    if (!response.ok) {
      setMessage(payload.error || "保存失败。");
      setSaving(false);
      return false;
    }

    setSettings(payload.settings);
    await refreshStatus();
    setMessage("配置已保存。");
    setSaving(false);
    return true;
  }

  async function runTest(target: ActionTarget) {
    const saved = await saveSettings();
    if (!saved) {
      return;
    }

    setBusy(target);
    setMessage(`正在执行${actionLabels[target]}...`);

    const response = await fetch("/api/integrations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ target }),
    });
    const payload = await response.json();

    setBusy("");
    await refreshStatus();

    if (!response.ok) {
      setMessage(payload.error || "测试失败。");
      return;
    }

    setMessage(payload.message || `${actionLabels[target]}通过。`);
  }

  return (
    <section className="rounded-[28px] border border-[var(--line)] bg-[var(--card-strong)] p-5 shadow-[0_18px_48px_rgba(15,23,42,0.06)] lg:p-6">
      <div className="flex flex-col gap-3 border-b border-[var(--line)] pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs tracking-[0.28em] text-[var(--muted)]">连接设置</p>
          <h2 className="mt-2 font-serif text-3xl text-[var(--foreground)]">
            只保留必要配置
          </h2>
          <p className="mt-2 text-sm text-[var(--muted)]">
            配置页只做连接，不参与日常录入。参数保存后可直接测试连通性。
          </p>
        </div>
        <button
          type="button"
          onClick={saveSettings}
          disabled={saving || Boolean(busy)}
          className="rounded-full border border-[var(--line)] bg-[var(--surface-strong)] px-5 py-2.5 text-sm text-[var(--foreground)] transition hover:border-[var(--line-strong)] disabled:cursor-not-allowed disabled:text-[var(--muted)]"
        >
          {saving ? "保存中..." : "保存配置"}
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <StatusChip label="存储" text={status.storage.label} />
        <StatusChip label="Notion" text={status.notion.label} />
        <StatusChip label="SMTP" text={status.smtp.label} />
        <StatusChip label="滴答邮箱" text={status.ticktickEmail.label} />
      </div>

      <div className="mt-5 space-y-3">
        <ConfigSection
          title="Notion"
          description="用于自动沉淀记录。"
          defaultOpen
        >
          <div className="grid gap-4 lg:grid-cols-2">
            <InputField
              label="Integration Secret"
              type="password"
              value={settings.notionToken}
              onChange={(value) => updateField("notionToken", value)}
              placeholder="ntn_xxx"
            />
            <InputField
              label="Parent Page URL / ID"
              value={settings.notionParentPageId}
              onChange={(value) => updateField("notionParentPageId", value)}
              placeholder="https://www.notion.so/..."
            />
          </div>
          <div className="mt-4">
            <ActionButton
              onClick={() => runTest("notion")}
              disabled={saving || Boolean(busy)}
              active={busy === "notion"}
              label={busy === "notion" ? "测试中..." : "保存并测试 Notion"}
            />
          </div>
        </ConfigSection>

        <ConfigSection
          title="滴答清单邮箱"
          description="用于自动投递 AI 识别出的待办。"
          defaultOpen
        >
          <div className="grid gap-4 lg:grid-cols-2">
            <InputField
              label="SMTP Host"
              value={settings.smtpHost}
              onChange={(value) => updateField("smtpHost", value)}
              placeholder="smtp.qq.com"
            />
            <InputField
              label="SMTP Port"
              value={settings.smtpPort}
              onChange={(value) => updateField("smtpPort", value)}
              placeholder="587"
            />
            <InputField
              label="SMTP User"
              value={settings.smtpUser}
              onChange={(value) => updateField("smtpUser", value)}
              placeholder="you@example.com"
            />
            <InputField
              label="SMTP From"
              value={settings.smtpFrom}
              onChange={(value) => updateField("smtpFrom", value)}
              placeholder="you@example.com"
            />
            <InputField
              label="SMTP Password / App Code"
              type="password"
              value={settings.smtpPass}
              onChange={(value) => updateField("smtpPass", value)}
              placeholder="授权码或应用密码"
            />
            <InputField
              label="滴答收件邮箱"
              value={settings.tickTickInboxEmail}
              onChange={(value) => updateField("tickTickInboxEmail", value)}
              placeholder="todo+xxx@mail.dida365.com"
            />
          </div>

          <label className="mt-4 flex items-center gap-3 rounded-[18px] border border-[var(--line)] bg-[var(--surface-strong)] px-4 py-3 text-sm text-[var(--foreground)]">
            <input
              type="checkbox"
              checked={settings.smtpSecure}
              onChange={(event) => updateField("smtpSecure", event.target.checked)}
            />
            使用 SSL / TLS 直连
          </label>

          <div className="mt-4 flex flex-wrap gap-3">
            <ActionButton
              onClick={() => runTest("smtp")}
              disabled={saving || Boolean(busy)}
              active={busy === "smtp"}
              label={busy === "smtp" ? "测试中..." : "保存并测试 SMTP"}
            />
            <ActionButton
              onClick={() => runTest("ticktick-email")}
              disabled={saving || Boolean(busy)}
              active={busy === "ticktick-email"}
              primary
              label={
                busy === "ticktick-email" ? "发送中..." : "保存并发送滴答测试邮件"
              }
            />
          </div>
        </ConfigSection>

        <ConfigSection
          title="附件存储"
          description="图片、视频、PDF 和文档建议放到 OSS。"
        >
          <div className="flex flex-wrap gap-3">
            <ModeButton
              label="本地存储"
              active={settings.storageMode === "local"}
              onClick={() => updateField("storageMode", "local")}
            />
            <ModeButton
              label="阿里云 OSS"
              active={settings.storageMode === "oss"}
              onClick={() => updateField("storageMode", "oss")}
            />
          </div>

          {settings.storageMode === "oss" ? (
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <InputField
                label="Region"
                value={settings.ossRegion}
                onChange={(value) => updateField("ossRegion", value)}
                placeholder="oss-cn-hangzhou"
              />
              <InputField
                label="Bucket"
                value={settings.ossBucket}
                onChange={(value) => updateField("ossBucket", value)}
                placeholder="wechat-ai-note"
              />
              <InputField
                label="Endpoint"
                value={settings.ossEndpoint}
                onChange={(value) => updateField("ossEndpoint", value)}
                placeholder="可选，例如 https://oss-cn-hangzhou.aliyuncs.com"
              />
              <InputField
                label="路径前缀"
                value={settings.ossPathPrefix}
                onChange={(value) => updateField("ossPathPrefix", value)}
                placeholder="uploads/wechat"
              />
              <InputField
                label="AccessKey ID"
                value={settings.ossAccessKeyId}
                onChange={(value) => updateField("ossAccessKeyId", value)}
                placeholder="LTAI..."
              />
              <InputField
                label="AccessKey Secret"
                type="password"
                value={settings.ossAccessKeySecret}
                onChange={(value) => updateField("ossAccessKeySecret", value)}
                placeholder="请输入密钥"
              />
              <div className="lg:col-span-2">
                <InputField
                  label="公网访问域名"
                  value={settings.ossPublicBaseUrl}
                  onChange={(value) => updateField("ossPublicBaseUrl", value)}
                  placeholder="可选，例如 https://cdn.example.com"
                />
              </div>
            </div>
          ) : (
            <p className="mt-4 rounded-[18px] border border-[var(--line)] bg-[var(--surface-strong)] px-4 py-4 text-sm text-[var(--muted-strong)]">
              当前为本地存储模式，适合先验证产品流程。附件量变大后再切到 OSS。
            </p>
          )}

          <div className="mt-4">
            <ActionButton
              onClick={() => runTest("oss")}
              disabled={saving || Boolean(busy) || settings.storageMode !== "oss"}
              active={busy === "oss"}
              label={busy === "oss" ? "测试中..." : "保存并测试 OSS"}
            />
          </div>
        </ConfigSection>
      </div>

      {message ? (
        <p className="mt-5 rounded-[18px] border border-[var(--line)] bg-[var(--surface-strong)] px-4 py-3 text-sm text-[var(--foreground)]">
          {message}
        </p>
      ) : null}
    </section>
  );
}

function StatusChip({ label, text }: { label: string; text: string }) {
  return (
    <span className="rounded-full border border-[var(--line)] bg-[var(--surface-strong)] px-3 py-1.5 text-xs text-[var(--muted-strong)]">
      {label} · {text}
    </span>
  );
}

function ConfigSection({
  title,
  description,
  children,
  defaultOpen = false,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details
      open={defaultOpen}
      className="rounded-[22px] border border-[var(--line)] bg-[var(--surface)]"
    >
      <summary className="cursor-pointer list-none px-4 py-4">
        <p className="text-sm font-medium text-[var(--foreground)]">{title}</p>
        <p className="mt-1 text-xs text-[var(--muted)]">{description}</p>
      </summary>
      <div className="border-t border-[var(--line)] px-4 py-4">{children}</div>
    </details>
  );
}

function ModeButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "rounded-full border px-4 py-2 text-sm transition",
        active
          ? "border-slate-900 bg-slate-950 text-white"
          : "border-[var(--line)] bg-[var(--surface-strong)] text-[var(--foreground)] hover:border-[var(--line-strong)]",
      ].join(" ")}
    >
      {label}
    </button>
  );
}

function ActionButton({
  label,
  disabled,
  active,
  onClick,
  primary = false,
}: {
  label: string;
  disabled: boolean;
  active: boolean;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        "rounded-full px-4 py-2.5 text-sm transition disabled:cursor-not-allowed",
        primary
          ? "bg-slate-950 text-white hover:bg-slate-800 disabled:bg-slate-400"
          : "border border-[var(--line)] bg-[var(--surface-strong)] text-[var(--foreground)] hover:border-[var(--line-strong)] disabled:text-[var(--muted)]",
        active ? "opacity-80" : "",
      ].join(" ")}
    >
      {label}
    </button>
  );
}

function InputField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  type?: "text" | "password";
}) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium text-[var(--foreground)]">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-[18px] border border-[var(--line)] bg-[var(--surface-strong)] px-4 py-3 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
      />
    </label>
  );
}
