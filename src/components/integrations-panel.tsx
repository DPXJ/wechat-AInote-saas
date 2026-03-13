"use client";

import { useState, useCallback, useEffect } from "react";
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
  const [busy, setBusy] = useState<ActionTarget | "">("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [settingsRes, statusRes] = await Promise.all([
          fetch("/api/settings"),
          fetch("/api/integrations"),
        ]);
        if (cancelled) return;
        if (settingsRes.ok) {
          const d = await settingsRes.json();
          setSettings(d.settings);
        }
        if (statusRes.ok) {
          const d = await statusRes.json();
          setStatus(d.status);
        }
      } catch { /* use initial values on network error */ }
    })();
    return () => { cancelled = true; };
  }, []);

  function updateField<K extends keyof IntegrationSettings>(
    key: K,
    value: IntegrationSettings[K],
  ) {
    setSettings((c) => ({ ...c, [key]: value }));
  }

  async function refreshStatus() {
    const res = await fetch("/api/integrations");
    const data = await res.json();
    setStatus(data.status);
  }

  const saveSettings = useCallback(async (): Promise<{ ok: boolean; msg: string }> => {
    const res = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
    const data = await res.json();
    if (!res.ok) {
      return { ok: false, msg: data.error || "保存失败。" };
    }
    setSettings(data.settings);
    await refreshStatus();
    return { ok: true, msg: "配置已保存。" };
  }, [settings]);

  async function runTest(target: ActionTarget, setMsg: (m: string) => void) {
    const result = await saveSettings();
    if (!result.ok) {
      setMsg(result.msg);
      return;
    }
    setBusy(target);
    setMsg(`正在执行${actionLabels[target]}...`);
    const res = await fetch("/api/integrations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target }),
    });
    const data = await res.json();
    setBusy("");
    await refreshStatus();
    if (!res.ok) {
      setMsg(data.error || "测试失败。");
      return;
    }
    setMsg(data.message || `${actionLabels[target]}通过。`);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {/* Status */}
      <div className="flex flex-wrap gap-1.5">
        <Chip label="存储" text={status.storage.label} />
        <Chip label="Notion" text={status.notion.label} />
        <Chip label="SMTP" text={status.smtp.label} />
        <Chip label="滴答" text={status.ticktickEmail.label} />
      </div>

      {/* Notion */}
      <SectionCard
        title="Notion"
        desc="自动沉淀记录到 Notion"
        defaultOpen
        saveSettings={saveSettings}
        footer={(msg, setMsg) => (
          <Btn
            onClick={() => runTest("notion", setMsg)}
            disabled={Boolean(busy)}
            label={busy === "notion" ? "测试中..." : "保存并测试 Notion"}
          />
        )}
      >
        <div className="grid gap-3 lg:grid-cols-2">
          <Field
            label="Integration Secret"
            type="password"
            value={settings.notionToken}
            onChange={(v) => updateField("notionToken", v)}
            placeholder="ntn_xxx"
          />
          <Field
            label="Parent Page URL / ID"
            value={settings.notionParentPageId}
            onChange={(v) => updateField("notionParentPageId", v)}
            placeholder="https://www.notion.so/..."
          />
        </div>
      </SectionCard>

      {/* SMTP + TickTick */}
      <SectionCard
        title="滴答清单邮箱"
        desc="自动投递 AI 识别出的待办"
        defaultOpen
        saveSettings={saveSettings}
        footer={(msg, setMsg) => (
          <div className="flex flex-wrap gap-2">
            <Btn
              onClick={() => runTest("smtp", setMsg)}
              disabled={Boolean(busy)}
              label={busy === "smtp" ? "测试中..." : "测试 SMTP"}
            />
            <Btn
              onClick={() => runTest("ticktick-email", setMsg)}
              disabled={Boolean(busy)}
              primary
              label={busy === "ticktick-email" ? "发送中..." : "发送滴答测试邮件"}
            />
          </div>
        )}
      >
        <div className="grid gap-3 lg:grid-cols-2">
          <Field label="SMTP Host" value={settings.smtpHost} onChange={(v) => updateField("smtpHost", v)} placeholder="smtp.qq.com" />
          <Field label="SMTP Port" value={settings.smtpPort} onChange={(v) => updateField("smtpPort", v)} placeholder="587" />
          <Field label="SMTP User" value={settings.smtpUser} onChange={(v) => updateField("smtpUser", v)} placeholder="you@example.com" />
          <Field label="SMTP From" value={settings.smtpFrom} onChange={(v) => updateField("smtpFrom", v)} placeholder="you@example.com" />
          <Field label="SMTP Password" type="password" value={settings.smtpPass} onChange={(v) => updateField("smtpPass", v)} placeholder="授权码或应用密码" />
          <Field label="滴答收件邮箱" value={settings.tickTickInboxEmail} onChange={(v) => updateField("tickTickInboxEmail", v)} placeholder="todo+xxx@mail.dida365.com" />
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm text-[var(--foreground)]">
          <input
            type="checkbox"
            checked={settings.smtpSecure}
            onChange={(e) => updateField("smtpSecure", e.target.checked)}
          />
          使用 SSL/TLS 直连
        </label>
      </SectionCard>

      {/* Storage */}
      <SectionCard
        title="附件存储"
        desc="图片、视频、文档的存储方式"
        saveSettings={saveSettings}
        footer={(_msg, setMsg) => (
          <Btn
            onClick={() => runTest("oss", setMsg)}
            disabled={Boolean(busy) || settings.storageMode !== "oss"}
            label={busy === "oss" ? "测试中..." : "保存并测试 OSS"}
          />
        )}
      >
        <div className="flex gap-2">
          <ModeBtn label="本地存储" active={settings.storageMode === "local"} onClick={() => updateField("storageMode", "local")} />
          <ModeBtn label="阿里云 OSS" active={settings.storageMode === "oss"} onClick={() => updateField("storageMode", "oss")} />
        </div>

        {settings.storageMode === "oss" ? (
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            <Field label="Region" value={settings.ossRegion} onChange={(v) => updateField("ossRegion", v)} placeholder="oss-cn-hangzhou" />
            <Field label="Bucket" value={settings.ossBucket} onChange={(v) => updateField("ossBucket", v)} placeholder="wechat-ai-note" />
            <Field label="Endpoint" value={settings.ossEndpoint} onChange={(v) => updateField("ossEndpoint", v)} placeholder="可选" />
            <Field label="路径前缀" value={settings.ossPathPrefix} onChange={(v) => updateField("ossPathPrefix", v)} placeholder="uploads/wechat" />
            <Field label="AccessKey ID" value={settings.ossAccessKeyId} onChange={(v) => updateField("ossAccessKeyId", v)} placeholder="LTAI..." />
            <Field label="AccessKey Secret" type="password" value={settings.ossAccessKeySecret} onChange={(v) => updateField("ossAccessKeySecret", v)} placeholder="请输入密钥" />
            <div className="lg:col-span-2">
              <Field label="公网访问域名" value={settings.ossPublicBaseUrl} onChange={(v) => updateField("ossPublicBaseUrl", v)} placeholder="可选" />
            </div>
          </div>
        ) : (
          <p className="mt-3 text-xs text-[var(--muted)]">
            本地存储模式，适合先验证流程。附件量变大后再切到 OSS。
          </p>
        )}
      </SectionCard>

      {/* OCR */}
      <SectionCard
        title="图片 OCR 识别"
        desc="使用 Vision 模型自动识别图片中的文字和信息"
        saveSettings={saveSettings}
      >
        <label className="flex items-center gap-2 text-sm text-[var(--foreground)]">
          <input
            type="checkbox"
            checked={settings.ocrEnabled}
            onChange={(e) => updateField("ocrEnabled", e.target.checked)}
          />
          启用 OCR 识别
        </label>
        {settings.ocrEnabled && (
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            <div className="lg:col-span-2">
              <Field
                label="Vision Model Base URL"
                value={settings.visionModelBaseUrl}
                onChange={(v) => updateField("visionModelBaseUrl", v)}
                placeholder="https://ark.cn-beijing.volces.com/api/v3"
              />
            </div>
            <Field
              label="Vision Model API Key"
              type="password"
              value={settings.visionModelApiKey}
              onChange={(v) => updateField("visionModelApiKey", v)}
              placeholder="请输入 API Key"
            />
            <Field
              label="Vision Model Name"
              value={settings.visionModelName}
              onChange={(v) => updateField("visionModelName", v)}
              placeholder="doubao-1-5-vision-pro-32k"
              hint="火山方舟用模型 ID，如 doubao-1-5-vision-pro-32k"
            />
          </div>
        )}
      </SectionCard>
    </div>
  );
}

/* ── SectionCard with its own save button & message ── */

function SectionCard({
  title,
  desc,
  children,
  defaultOpen = false,
  saveSettings,
  footer,
}: {
  title: string;
  desc: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  saveSettings: () => Promise<{ ok: boolean; msg: string }>;
  footer?: (msg: string, setMsg: (m: string) => void) => React.ReactNode;
}) {
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  async function handleSave() {
    setSaving(true);
    setMsg("正在保存...");
    const result = await saveSettings();
    setMsg(result.msg);
    setSaving(false);
  }

  return (
    <details open={defaultOpen} className="rounded-xl border border-[var(--line)] bg-[var(--card)]">
      <summary className="cursor-pointer list-none px-4 py-3">
        <p className="text-sm font-medium text-[var(--foreground)]">{title}</p>
        <p className="mt-0.5 text-xs text-[var(--muted)]">{desc}</p>
      </summary>
      <div className="border-t border-[var(--line)] px-4 py-3 space-y-3">
        {children}

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-[var(--foreground)] px-4 py-2 text-sm font-medium text-[var(--background)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "保存中..." : "保存配置"}
          </button>
          {footer?.(msg, setMsg)}
        </div>

        {msg && (
          <p className={[
            "rounded-lg px-3 py-2 text-xs",
            msg.includes("失败") || msg.includes("错误") || msg.includes("校验")
              ? "bg-rose-500/10 text-rose-500"
              : msg.includes("已保存") || msg.includes("通过")
                ? "bg-emerald-500/10 text-emerald-500"
                : "bg-[var(--surface)] text-[var(--muted-strong)]",
          ].join(" ")}>
            {msg}
          </p>
        )}
      </div>
    </details>
  );
}

/* ── Primitives ── */

function Chip({ label, text }: { label: string; text: string }) {
  return (
    <span className="rounded-lg bg-[var(--surface)] px-2.5 py-1 text-xs text-[var(--muted-strong)]">
      {label} · {text}
    </span>
  );
}

function ModeBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "rounded-lg px-3 py-1.5 text-sm transition",
        active
          ? "bg-[var(--foreground)] text-[var(--background)]"
          : "text-[var(--muted-strong)] hover:bg-[var(--surface)]",
      ].join(" ")}
    >
      {label}
    </button>
  );
}

function Btn({
  label,
  disabled,
  onClick,
  primary = false,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        "rounded-lg px-4 py-2 text-sm transition disabled:cursor-not-allowed disabled:opacity-50",
        primary
          ? "bg-[var(--foreground)] text-[var(--background)] hover:opacity-90"
          : "border border-[var(--line)] text-[var(--foreground)] hover:border-[var(--line-strong)]",
      ].join(" ")}
    >
      {label}
    </button>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  type?: "text" | "password";
  hint?: string;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-[var(--foreground)]">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-[var(--line)] bg-[var(--surface-strong)] px-3 py-2 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--accent)]"
      />
      {hint && <p className="text-[10px] text-[var(--muted)]">{hint}</p>}
    </label>
  );
}
