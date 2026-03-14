"use client";

import { useState, useCallback, useEffect } from "react";
import type { IntegrationSettings, IntegrationStatus } from "@/lib/types";

type ActionTarget = "notion" | "smtp" | "ticktick-email" | "oss";
type SettingsTab = "notion" | "ticktick" | "storage" | "ocr" | "imap" | "backup";

const actionLabels: Record<ActionTarget, string> = {
  notion: "测试 Notion",
  smtp: "测试 SMTP",
  "ticktick-email": "发送滴答测试邮件",
  oss: "测试 OSS",
};

function SettingsTabIcon({ id }: { id: string }) {
  const p = { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (id) {
    case "notion": return <svg {...p}><path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" /></svg>;
    case "ticktick": return <svg {...p}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M9 12l2 2 4-4" /></svg>;
    case "storage": return <svg {...p}><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /></svg>;
    case "ocr": return <svg {...p}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>;
    case "imap": return <svg {...p}><rect x="2" y="4" width="20" height="16" rx="2" /><path d="M22 7l-10 7L2 7" /></svg>;
    case "backup": return <svg {...p}><path d="M12 2v6M12 22v-6M4.93 4.93l4.24 4.24M14.83 14.83l4.24 4.24M2 12h6M22 12h-6M4.93 19.07l4.24-4.24M14.83 9.17l4.24-4.24" /></svg>;
    default: return null;
  }
}

const settingsTabs: Array<{ id: SettingsTab; label: string }> = [
  { id: "notion", label: "Notion" },
  { id: "ticktick", label: "滴答清单" },
  { id: "storage", label: "附件存储" },
  { id: "ocr", label: "OCR 识别" },
  { id: "imap", label: "邮件收录" },
  { id: "backup", label: "数据备份" },
];

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
  const [activeTab, setActiveTab] = useState<SettingsTab>("notion");
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);

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
      } catch {}
    })();
    return () => { cancelled = true; };
  }, []);

  function updateField<K extends keyof IntegrationSettings>(key: K, value: IntegrationSettings[K]) {
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
    if (!res.ok) return { ok: false, msg: data.error || "保存失败。" };
    setSettings(data.settings);
    await refreshStatus();
    return { ok: true, msg: "配置已保存。" };
  }, [settings]);

  async function handleSave() {
    setSaving(true);
    setMsg("正在保存...");
    const result = await saveSettings();
    setMsg(result.msg);
    setSaving(false);
  }

  async function runTest(target: ActionTarget) {
    const result = await saveSettings();
    if (!result.ok) { setMsg(result.msg); return; }
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
    if (!res.ok) { setMsg(data.error || "测试失败。"); return; }
    setMsg(data.message || `${actionLabels[target]}通过。`);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {/* Tab navigation */}
      <div className="flex items-center gap-1 border-b border-[var(--line)]">
        {settingsTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => { setActiveTab(tab.id); setMsg(""); }}
            className={[
              "flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-medium transition",
              activeTab === tab.id
                ? "border-[var(--foreground)] text-[var(--foreground)]"
                : "border-transparent text-[var(--muted)] hover:text-[var(--foreground)]",
            ].join(" ")}
          >
            <SettingsTabIcon id={tab.id} />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab panels */}
      <div className="rounded-xl border border-[var(--line)] bg-[var(--card)] p-5 space-y-4">
        {activeTab === "notion" && (
          <>
            <div className="grid gap-3 lg:grid-cols-2">
              <Field label="Integration Secret" type="password" value={settings.notionToken} onChange={(v) => updateField("notionToken", v)} placeholder="ntn_xxx" />
              <Field label="Parent Page URL / ID" value={settings.notionParentPageId} onChange={(v) => updateField("notionParentPageId", v)} placeholder="https://www.notion.so/..." />
            </div>
            <div className="flex flex-wrap items-center gap-2 pt-2">
              <SaveBtn saving={saving} onSave={handleSave} />
              <Btn onClick={() => runTest("notion")} disabled={Boolean(busy)} label={busy === "notion" ? "测试中..." : "保存并测试"} />
            </div>
          </>
        )}

        {activeTab === "ticktick" && (
          <>
            <div className="grid gap-3 lg:grid-cols-2">
              <Field label="SMTP Host" value={settings.smtpHost} onChange={(v) => updateField("smtpHost", v)} placeholder="smtp.qq.com" />
              <Field label="SMTP Port" value={settings.smtpPort} onChange={(v) => updateField("smtpPort", v)} placeholder="587" />
              <Field label="SMTP User" value={settings.smtpUser} onChange={(v) => updateField("smtpUser", v)} placeholder="you@example.com" />
              <Field label="SMTP From" value={settings.smtpFrom} onChange={(v) => updateField("smtpFrom", v)} placeholder="you@example.com" />
              <Field label="SMTP Password" type="password" value={settings.smtpPass} onChange={(v) => updateField("smtpPass", v)} placeholder="授权码或应用密码" />
              <Field label="滴答收件邮箱" value={settings.tickTickInboxEmail} onChange={(v) => updateField("tickTickInboxEmail", v)} placeholder="todo+xxx@mail.dida365.com" />
            </div>
            <label className="flex items-center gap-2 text-sm text-[var(--foreground)]">
              <input type="checkbox" checked={settings.smtpSecure} onChange={(e) => updateField("smtpSecure", e.target.checked)} />
              使用 SSL/TLS 直连
            </label>
            <div className="flex flex-wrap items-center gap-2 pt-2">
              <SaveBtn saving={saving} onSave={handleSave} />
              <Btn onClick={() => runTest("smtp")} disabled={Boolean(busy)} label={busy === "smtp" ? "测试中..." : "测试 SMTP"} />
              <Btn onClick={() => runTest("ticktick-email")} disabled={Boolean(busy)} label={busy === "ticktick-email" ? "发送中..." : "发送滴答测试邮件"} primary />
            </div>
          </>
        )}

        {activeTab === "storage" && (
          <>
            <div className="flex gap-2">
              <ModeBtn label="本地存储" active={settings.storageMode === "local"} onClick={() => updateField("storageMode", "local")} />
              <ModeBtn label="阿里云 OSS" active={settings.storageMode === "oss"} onClick={() => updateField("storageMode", "oss")} />
            </div>
            {settings.storageMode === "oss" ? (
              <div className="grid gap-3 lg:grid-cols-2">
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
              <p className="text-xs text-[var(--muted)]">本地存储模式，适合先验证流程。附件量变大后再切到 OSS。</p>
            )}
            <div className="flex flex-wrap items-center gap-2 pt-2">
              <SaveBtn saving={saving} onSave={handleSave} />
              <Btn onClick={() => runTest("oss")} disabled={Boolean(busy) || settings.storageMode !== "oss"} label={busy === "oss" ? "测试中..." : "保存并测试 OSS"} />
            </div>
          </>
        )}

        {activeTab === "ocr" && (
          <>
            <label className="flex items-center gap-2 text-sm text-[var(--foreground)]">
              <input type="checkbox" checked={settings.ocrEnabled} onChange={(e) => updateField("ocrEnabled", e.target.checked)} />
              启用 OCR 识别
            </label>
            {settings.ocrEnabled && (
              <div className="grid gap-3 lg:grid-cols-2">
                <div className="lg:col-span-2">
                  <Field label="Vision Model Base URL" value={settings.visionModelBaseUrl} onChange={(v) => updateField("visionModelBaseUrl", v)} placeholder="https://ark.cn-beijing.volces.com/api/v3" />
                </div>
                <Field label="Vision Model API Key" type="password" value={settings.visionModelApiKey} onChange={(v) => updateField("visionModelApiKey", v)} placeholder="请输入 API Key" />
                <Field label="Vision Model Name" value={settings.visionModelName} onChange={(v) => updateField("visionModelName", v)} placeholder="doubao-1-5-vision-pro-32k" hint="火山方舟用模型 ID，如 doubao-1-5-vision-pro-32k" />
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2 pt-2">
              <SaveBtn saving={saving} onSave={handleSave} />
              {settings.ocrEnabled && <BatchOcrBtn />}
            </div>
          </>
        )}

        {/* IMAP settings */}
        {activeTab === "imap" && (
          <>
            <p className="text-sm text-[var(--muted-strong)]">
              配置 IMAP 邮箱后，可自动收录邮件内容到知识库。
            </p>
            <div className="grid gap-3 lg:grid-cols-2">
              <Field label="IMAP 服务器" value={settings.imapHost} onChange={(v) => updateField("imapHost", v)} placeholder="imap.example.com" />
              <Field label="端口" value={settings.imapPort} onChange={(v) => updateField("imapPort", v)} placeholder="993" />
              <Field label="用户名" value={settings.imapUser} onChange={(v) => updateField("imapUser", v)} placeholder="your@email.com" />
              <Field label="密码" type="password" value={settings.imapPass} onChange={(v) => updateField("imapPass", v)} placeholder="IMAP 密码" />
            </div>
            <label className="flex items-center gap-2 text-sm text-[var(--foreground)]">
              <input type="checkbox" checked={settings.imapSecure} onChange={(e) => updateField("imapSecure", e.target.checked)} className="accent-[var(--foreground)]" />
              启用 SSL/TLS
            </label>
            <div className="flex flex-wrap items-center gap-2 pt-2">
              <SaveBtn saving={saving} onSave={handleSave} />
              <ImapFetchBtn />
            </div>
          </>
        )}

        {/* Backup settings */}
        {activeTab === "backup" && (
          <BackupSection />
        )}

        {/* Message feedback */}
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
    </div>
  );
}

/* ── Primitives ── */

function SaveBtn({ saving, onSave }: { saving: boolean; onSave: () => void }) {
  return (
    <button
      type="button"
      onClick={onSave}
      disabled={saving}
      className="rounded-lg bg-[var(--foreground)] px-5 py-2 text-sm font-medium text-[var(--background)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {saving ? "保存中..." : "保存配置"}
    </button>
  );
}

function ModeBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className={["rounded-lg px-3 py-1.5 text-sm transition", active ? "bg-[var(--foreground)] text-[var(--background)]" : "text-[var(--muted-strong)] hover:bg-[var(--surface)]"].join(" ")}
    >{label}</button>
  );
}

function Btn({ label, disabled, onClick, primary = false }: { label: string; disabled: boolean; onClick: () => void; primary?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className={["rounded-lg px-4 py-2 text-sm transition disabled:cursor-not-allowed disabled:opacity-50",
        primary ? "bg-[var(--foreground)] text-[var(--background)] hover:opacity-90" : "border border-[var(--line)] text-[var(--foreground)] hover:border-[var(--line-strong)]",
      ].join(" ")}
    >{label}</button>
  );
}

function Field({ label, value, onChange, placeholder, type = "text", hint }: {
  label: string; value: string; onChange: (v: string) => void; placeholder: string; type?: "text" | "password"; hint?: string;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-[var(--foreground)]">{label}</span>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="w-full rounded-lg border border-[var(--line)] bg-[var(--surface-strong)] px-3 py-2 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--foreground)]"
      />
      {hint && <p className="text-[10px] text-[var(--muted)]">{hint}</p>}
    </label>
  );
}

function BatchOcrBtn() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState("");
  const [stats, setStats] = useState<{ total: number; pending: number } | null>(null);

  useEffect(() => {
    fetch("/api/assets/batch-ocr")
      .then((r) => r.json())
      .then((d) => setStats({ total: d.total, pending: d.pending }))
      .catch(() => {});
  }, []);

  async function handleBatchOcr() {
    setLoading(true);
    setResult("");
    try {
      const res = await fetch("/api/assets/batch-ocr", { method: "POST" });
      const data = await res.json();
      setResult(`完成: 成功 ${data.success}，失败 ${data.failed}，共 ${data.total}`);
      setStats((s) => s ? { ...s, pending: data.total - data.success } : null);
    } catch {
      setResult("请求失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={handleBatchOcr}
        disabled={loading}
        className="rounded-lg border border-[var(--line)] px-4 py-2 text-sm text-[var(--foreground)] transition hover:border-[var(--line-strong)] disabled:opacity-50"
      >
        {loading ? "扫描中..." : "一键补扫"}
      </button>
      {stats && (
        <span className="text-xs text-[var(--muted)]">
          {stats.pending > 0 ? `待扫描 ${stats.pending} / ${stats.total}` : `全部已扫描 (${stats.total})`}
        </span>
      )}
      {result && <span className="text-xs text-[var(--muted-strong)]">{result}</span>}
    </div>
  );
}

function ImapFetchBtn() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState("");

  async function handleFetch() {
    setLoading(true);
    setResult("");
    try {
      const res = await fetch("/api/email-inbox", { method: "POST" });
      const data = await res.json();
      if (data.fetched > 0) {
        setResult(`成功收录 ${data.fetched} 封邮件`);
      } else if (data.errors?.length > 0) {
        setResult(`收录失败: ${data.errors[0]}`);
      } else {
        setResult("没有新邮件");
      }
    } catch {
      setResult("请求失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={handleFetch}
        disabled={loading}
        className="rounded-lg border border-[var(--line)] px-4 py-2 text-sm text-[var(--foreground)] transition hover:border-[var(--line-strong)] disabled:opacity-50"
      >
        {loading ? "收取中..." : "立即收取邮件"}
      </button>
      {result && <span className="text-xs text-[var(--muted-strong)]">{result}</span>}
    </div>
  );
}

function BackupSection() {
  const [restoring, setRestoring] = useState(false);
  const [msg, setMsg] = useState("");

  async function handleDownload() {
    window.open("/api/backup", "_blank");
  }

  async function handleRestore(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!confirm("恢复备份将替换当前数据库，确定继续？当前数据库会先自动备份。")) return;
    setRestoring(true);
    setMsg("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/backup", { method: "POST", body: formData });
      const data = await res.json();
      if (res.ok) {
        setMsg(data.message || "恢复成功，请刷新页面。");
      } else {
        setMsg(data.error || "恢复失败");
      }
    } catch {
      setMsg("请求失败");
    } finally {
      setRestoring(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--muted-strong)]">
        备份数据库到本地文件，或从备份文件恢复。
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleDownload}
          className="rounded-lg bg-[var(--foreground)] px-5 py-2 text-sm font-medium text-[var(--background)] transition hover:opacity-90"
        >
          下载备份
        </button>
        <label className="cursor-pointer rounded-lg border border-[var(--line)] px-4 py-2 text-sm text-[var(--foreground)] transition hover:border-[var(--line-strong)]">
          {restoring ? "恢复中..." : "上传恢复"}
          <input type="file" accept=".sqlite,.db" className="hidden" onChange={handleRestore} disabled={restoring} />
        </label>
      </div>
      {msg && <p className="text-xs text-[var(--muted-strong)]">{msg}</p>}
    </div>
  );
}
