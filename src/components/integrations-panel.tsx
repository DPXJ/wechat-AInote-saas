"use client";

import { useState, useCallback, useEffect } from "react";
import type { IntegrationSettings, IntegrationStatus } from "@/lib/types";
import { DEFAULT_SUMMARY_INSTRUCTIONS, DEFAULT_TODO_INSTRUCTIONS } from "@/lib/ai";

type ActionTarget = "notion" | "smtp" | "ticktick-email";
type SettingsTab = "ai" | "notion" | "ticktick" | "flomo" | "ocr" | "imap" | "backup";

const actionLabels: Record<ActionTarget, string> = {
  notion: "测试 Notion",
  smtp: "测试 SMTP",
  "ticktick-email": "测试连接",
};

function SettingsTabIcon({ id }: { id: string }) {
  const p = { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (id) {
    case "notion": return <svg {...p}><path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" /></svg>;
    case "ticktick": return <svg {...p}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M9 12l2 2 4-4" /></svg>;
    case "ocr": return <svg {...p}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>;
    case "imap": return <svg {...p}><rect x="2" y="4" width="20" height="16" rx="2" /><path d="M22 7l-10 7L2 7" /></svg>;
    case "backup": return <svg {...p}><path d="M12 2v6M12 22v-6M4.93 4.93l4.24 4.24M14.83 14.83l4.24 4.24M2 12h6M22 12h-6M4.93 19.07l4.24-4.24M14.83 9.17l4.24-4.24" /></svg>;
    case "ai": return <svg {...p}><path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z" /></svg>;
    case "flomo": return <svg {...p}><path d="M12 19l-7-5V8l7 5v6z" /><path d="M12 13l7-5v6l-7 5v-6z" /><path d="M5 8l7-5 7 5-7 5-7-5z" /></svg>;
    default: return null;
  }
}

const settingsTabs: Array<{ id: SettingsTab; label: string }> = [
  { id: "ai", label: "AI 摘要" },
  { id: "notion", label: "Notion" },
  { id: "ticktick", label: "滴答清单" },
  { id: "flomo", label: "flomo" },
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
  const [aiConfigured, setAiConfigured] = useState(false);
  const [busy, setBusy] = useState<ActionTarget | "">("");
  const [activeTab, setActiveTab] = useState<SettingsTab>("ai");
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
          if (typeof d.aiConfigured === "boolean") setAiConfigured(d.aiConfigured);
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
    if (typeof data.aiConfigured === "boolean") setAiConfigured(data.aiConfigured);
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
    setMsg(target === "ticktick-email" ? "正在测试连接..." : `正在执行${actionLabels[target]}...`);
    const res = await fetch("/api/integrations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target }),
    });
    const data = await res.json();
    setBusy("");
    await refreshStatus();
    if (!res.ok) { setMsg(data.error || "测试失败"); return; }
    setMsg(target === "ticktick-email" ? "连接测试成功，邮件已发送到滴答收件邮箱" : (data.message || `${actionLabels[target]}通过`));
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {/* Tab navigation */}
      <div className="flex flex-wrap items-center gap-1 border-b border-[var(--line)] overflow-x-auto">
        {settingsTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => { setActiveTab(tab.id); setMsg(""); }}
            className={[
              "flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition",
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
        {activeTab === "ai" && (
          <>
            <div className="flex items-center gap-2">
              <span className={`inline-flex h-2.5 w-2.5 rounded-full ${aiConfigured ? "bg-emerald-500" : "bg-amber-500"}`} />
              <span className="text-sm font-medium text-[var(--foreground)]">
                {aiConfigured ? "AI 摘要与标题生成已启用" : "AI 摘要与标题生成未配置"}
              </span>
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--muted)]">模型供应商</label>
                <select
                  value={settings.aiProvider || ""}
                  onChange={(e) => updateField("aiProvider", e.target.value as "" | "openai" | "glm" | "deepseek")}
                  className="w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--foreground)]"
                >
                  <option value="">请选择</option>
                  <option value="openai">OpenAI (GPT)</option>
                  <option value="glm">智谱 AI (GLM)</option>
                  <option value="deepseek">DeepSeek</option>
                </select>
              </div>
              <div>
                <Field
                  label="API 密钥"
                  type="password"
                  value={settings.aiApiKey || ""}
                  onChange={(v) => updateField("aiApiKey", v)}
                  placeholder={settings.aiProvider === "openai" ? "sk-xxx" : settings.aiProvider === "glm" ? "智谱 API Key" : settings.aiProvider === "deepseek" ? "DeepSeek API Key" : "选择供应商后输入"}
                />
              </div>
            </div>
            <p className="text-[12px] text-[var(--muted)]">
              模型名称使用默认值，无需额外配置。保存后新收录的记录将自动使用 AI 生成标题与摘要。
            </p>

            <div className="space-y-3 border-t border-[var(--line)] pt-4">
              <p className="text-xs font-semibold text-[var(--foreground)]">AI 分析补充要求</p>
              <p className="text-[11px] text-[var(--muted)]">
                系统会自动处理输出格式，你只需用自然语言描述对摘要和待办的额外要求，例如"摘要控制在 30 字以内"、"待办要标注优先级"等。
              </p>
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label className="text-xs font-medium text-[var(--muted)]">摘要与分析要求</label>
                  <button type="button" onClick={() => updateField("aiSummaryPrompt", DEFAULT_SUMMARY_INSTRUCTIONS)} className="text-[11px] text-[var(--muted)] hover:text-[var(--foreground)]">恢复默认</button>
                </div>
                <textarea
                  value={settings.aiSummaryPrompt || DEFAULT_SUMMARY_INSTRUCTIONS}
                  onChange={(e) => updateField("aiSummaryPrompt", e.target.value)}
                  rows={4}
                  className="w-full rounded-lg border border-[var(--line)] bg-[var(--surface-strong)] px-3 py-2 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--foreground)]"
                />
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label className="text-xs font-medium text-[var(--muted)]">待办识别要求</label>
                  <button type="button" onClick={() => updateField("aiTodoPrompt", DEFAULT_TODO_INSTRUCTIONS)} className="text-[11px] text-[var(--muted)] hover:text-[var(--foreground)]">恢复默认</button>
                </div>
                <textarea
                  value={settings.aiTodoPrompt || DEFAULT_TODO_INSTRUCTIONS}
                  onChange={(e) => updateField("aiTodoPrompt", e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-[var(--line)] bg-[var(--surface-strong)] px-3 py-2 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--foreground)]"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-2">
              <SaveBtn saving={saving} onSave={handleSave} />
            </div>
          </>
        )}

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
            <div className="rounded-lg bg-[var(--surface)] px-4 py-3 text-[13px] text-[var(--muted-strong)] space-y-2">
              <p className="font-medium text-[var(--foreground)]">配置说明</p>
              <ul className="list-disc list-inside space-y-1 text-[12px]">
                <li><strong>SMTP</strong>：QQ 邮箱在 设置 → 账户 → POP3/IMAP 中开启服务并获取授权码；163 同理。SMTP 密码填授权码，非登录密码。</li>
                <li><strong>滴答收件邮箱</strong>：滴答清单 App → 设置 → 日历与订阅 → 邮件收件 中复制邮箱地址（格式如 todo+xxx@mail.dida365.com）。</li>
                <li>端口 587 不通时可试 465，并勾选「使用 SSL/TLS 直连」。587 常被公司网络、校园网或运营商拦截（防垃圾邮件），465 为 SSL 直连，有时可绕过限制。</li>
              </ul>
            </div>
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
              <Btn onClick={() => runTest("ticktick-email")} disabled={Boolean(busy)} label={busy === "ticktick-email" ? "测试中..." : "测试连接"} primary />
            </div>
          </>
        )}

        {activeTab === "flomo" && (
          <>
            <p className="text-sm text-[var(--muted-strong)]">
              配置 flomo webhook 后，可将记录一键同步到 flomo 笔记。
            </p>
            <div className="rounded-lg bg-[var(--surface)] px-4 py-3 text-[13px] text-[var(--muted-strong)] space-y-2">
              <p className="font-medium text-[var(--foreground)]">获取 Webhook URL</p>
              <ol className="list-decimal list-inside space-y-1 text-[12px]">
                <li>打开 flomo 网页版或 App → 设置（齿轮图标）</li>
                <li>找到 <strong>API</strong> 菜单项，点击进入</li>
                <li>复制页面中显示的 Webhook URL（格式如 https://flomoapp.com/iwh/xxx/yyy）</li>
              </ol>
            </div>
            <div>
              <Field
                label="flomo Webhook URL"
                value={settings.flomoWebhookUrl || ""}
                onChange={(v) => updateField("flomoWebhookUrl", v)}
                placeholder="https://flomoapp.com/iwh/xxx/yyy"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2 pt-2">
              <SaveBtn saving={saving} onSave={handleSave} />
              <FlomoTestBtn webhookUrl={settings.flomoWebhookUrl || ""} onSave={saveSettings} />
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
            "rounded-lg px-3 py-2.5 text-sm font-medium flex items-center gap-2",
            msg.includes("失败") || msg.includes("错误") || msg.includes("校验")
              ? "bg-rose-500/10 text-rose-500"
              : msg.includes("成功") || msg.includes("已保存") || msg.includes("通过") || msg.includes("已发送")
                ? "bg-emerald-500/10 text-emerald-500"
                : "bg-[var(--surface)] text-[var(--muted-strong)]",
          ].join(" ")}>
            {msg.includes("成功") || msg.includes("已保存") || msg.includes("通过") || msg.includes("已发送") ? (
              <span className="text-emerald-500">✓</span>
            ) : msg.includes("失败") || msg.includes("错误") ? (
              <span className="text-rose-500">✕</span>
            ) : null}
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

function FlomoTestBtn({ webhookUrl, onSave }: { webhookUrl: string; onSave: () => Promise<{ ok: boolean; msg: string }> }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState("");

  async function handleTest() {
    if (!webhookUrl.trim()) {
      setResult("请先填写 Webhook URL");
      return;
    }
    const saveResult = await onSave();
    if (!saveResult.ok) { setResult(saveResult.msg); return; }
    setLoading(true);
    setResult("");
    try {
      const res = await fetch(webhookUrl.trim(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "AI 信迹连通性测试 — 如果你在 flomo 看到这条笔记，说明 webhook 配置正确。" }),
      });
      if (res.ok) {
        setResult("测试成功，已发送到 flomo");
      } else {
        setResult(`测试失败 (${res.status})`);
      }
    } catch {
      setResult("请求失败，请检查 URL 是否正确");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={handleTest}
        disabled={loading}
        className="rounded-lg border border-[var(--line)] px-4 py-2 text-sm text-[var(--foreground)] transition hover:border-[var(--line-strong)] disabled:opacity-50"
      >
        {loading ? "测试中..." : "测试连接"}
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
