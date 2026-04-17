"use client";

import { useState, useCallback, useEffect } from "react";
import type { IntegrationSettings, IntegrationStatus } from "@/lib/types";
import { DEFAULT_SUMMARY_INSTRUCTIONS, DEFAULT_TODO_INSTRUCTIONS } from "@/lib/ai";
import { getImageCacheUsage, clearImageCache } from "@/lib/image-cache";
import { APP_VERSION } from "@/lib/version";

type ActionTarget = "notion" | "smtp" | "ticktick-email";
type SettingsTab = "ai" | "notion" | "ticktick" | "flomo" | "ocr" | "imap" | "backup";

const actionLabels: Record<ActionTarget, string> = {
  notion: "测试 Notion",
  smtp: "测试 SMTP",
  "ticktick-email": "测试连接",
};

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
  const [flashTokenBusy, setFlashTokenBusy] = useState(false);
  const [pageOrigin, setPageOrigin] = useState("");

  useEffect(() => {
    setPageOrigin(typeof window !== "undefined" ? window.location.origin : "");
  }, []);

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

  const DEFAULT_OCR_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3";
  const DEFAULT_OCR_MODEL_NAME = "doubao-1-5-vision-pro-32k-250115";

  const saveSettings = useCallback(async (): Promise<{ ok: boolean; msg: string }> => {
    const snapshot = { ...settings };
    if (!snapshot.visionModelBaseUrl?.trim()) snapshot.visionModelBaseUrl = DEFAULT_OCR_BASE_URL;
    if (!snapshot.visionModelName?.trim()) snapshot.visionModelName = DEFAULT_OCR_MODEL_NAME;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 30000);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(snapshot),
        signal: controller.signal,
      });
      window.clearTimeout(timeoutId);
      let data: { error?: string; settings?: IntegrationSettings };
      try {
        data = await res.json();
      } catch {
        return { ok: false, msg: res.ok ? "保存失败，请重试。" : `请求失败 ${res.status}` };
      }
      if (!res.ok) return { ok: false, msg: data.error || "保存失败。" };
      setSettings((prev) => ({ ...prev, ...snapshot, ...(data.settings || {}) }));
      await refreshStatus();
      return { ok: true, msg: "配置已保存。" };
    } catch (e) {
      window.clearTimeout(timeoutId);
      if (e instanceof Error && e.name === "AbortError") return { ok: false, msg: "保存超时，请重试。" };
      return { ok: false, msg: e instanceof Error ? e.message : "保存失败，请重试。" };
    }
  }, [settings]);

  async function handleSave() {
    setSaving(true);
    setMsg("正在保存...");
    try {
      const result = await saveSettings();
      setMsg(result.msg);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "保存失败，请重试。");
    } finally {
      setSaving(false);
    }
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
    <div className="mx-auto w-full max-w-5xl min-w-0">
      {/* 整块为一张卡片：标签栏 + 内容区同宽、标签不换行 */}
      <div className="rounded-xl border border-[var(--line)] bg-[var(--card)] overflow-hidden">
        <div className="flex flex-nowrap items-stretch justify-between gap-2 border-b border-[var(--line)] bg-[var(--card)]">
          <div className="hide-scrollbar flex min-w-0 flex-1 flex-nowrap items-end gap-0 overflow-x-auto overflow-y-hidden">
            {settingsTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => { setActiveTab(tab.id); setMsg(""); }}
                className={[
                  "shrink-0 whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition",
                  activeTab === tab.id
                    ? "border-[var(--foreground)] text-[var(--foreground)]"
                    : "border-transparent text-[var(--muted)] hover:text-[var(--foreground)]",
                ].join(" ")}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div
            className="flex shrink-0 items-center border-l border-[var(--line)] px-4 py-2"
            title="当前部署版本，用于核对线上是否为最新构建"
          >
            <span className="text-[11px] tabular-nums text-[var(--muted)]">v{APP_VERSION}</span>
          </div>
        </div>

        {/* 配置区：统一 max-w-4xl，与滴答清单输入区域宽度一致 */}
        <div className="p-6">
          <div className="mx-auto w-full max-w-4xl min-w-0 space-y-4">
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
              <FlomoTestBtn webhookUrl={settings.flomoWebhookUrl || ""} />
            </div>

            <div className="mt-6 space-y-3 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-4 py-3">
              <p className="text-sm font-medium text-[var(--foreground)]">闪念 HTTP 接入</p>
              <p className="text-[13px] leading-relaxed text-[var(--muted-strong)]">
                在其它工具里调用浮墨 API 写入 flomo 的同时，可再请求本接口把同一条内容同步到左侧「闪念」列表。先点击下方生成令牌，再在自动化里使用 Bearer 鉴权。
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Btn
                  label={flashTokenBusy ? "生成中…" : "生成 / 轮换令牌"}
                  disabled={flashTokenBusy}
                  primary
                  onClick={async () => {
                    setFlashTokenBusy(true);
                    try {
                      const res = await fetch("/api/flash-memos/token", { method: "POST" });
                      const data = await res.json();
                      if (res.ok && data.settings) {
                        setSettings(data.settings);
                        setMsg("已生成新令牌，请复制保存；旧令牌随即失效。");
                      } else {
                        setMsg(data.error || "生成失败。");
                      }
                    } catch {
                      setMsg("生成失败，请重试。");
                    } finally {
                      setFlashTokenBusy(false);
                    }
                  }}
                />
                {settings.flashMemoIngestToken ? (
                  <button
                    type="button"
                    className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm text-[var(--foreground)] transition hover:bg-[var(--surface-strong)]"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(settings.flashMemoIngestToken);
                        setMsg("已复制令牌。");
                      } catch {
                        setMsg("复制失败，请手动选择复制。");
                      }
                    }}
                  >
                    复制令牌
                  </button>
                ) : null}
              </div>
              {settings.flashMemoIngestToken ? (
                <>
                  <label className="block space-y-1.5">
                    <span className="text-xs font-medium text-[var(--foreground)]">接入令牌（保密）</span>
                    <input
                      type="password"
                      readOnly
                      value={settings.flashMemoIngestToken}
                      className="w-full rounded-lg border border-[var(--line)] bg-[var(--card)] px-3 py-2 font-mono text-[12px] text-[var(--foreground)] outline-none"
                    />
                  </label>
                  <p className="text-[12px] text-[var(--muted)] break-all">
                    端点：<code className="rounded bg-[var(--card)] px-1 py-0.5">{pageOrigin || "…"}/api/flash-memos/ingest</code>
                  </p>
                  <pre className="overflow-x-auto rounded-lg bg-[var(--card)] p-3 text-[11px] leading-relaxed text-[var(--muted-strong)]">
{`curl -X POST '${pageOrigin || ""}/api/flash-memos/ingest' \\
  -H 'Authorization: Bearer <令牌>' \\
  -H 'Content-Type: application/json' \\
  -d '{"content":"一条闪念","source":"flomo"}'`}
                  </pre>
                  <p className="text-[11px] text-[var(--muted)]">
                    可选字段 <code className="rounded bg-[var(--card)] px-1">externalId</code>：若重复提交相同 id，将不会重复写入。
                  </p>
                </>
              ) : (
                <p className="text-[12px] text-[var(--muted)]">尚未生成令牌。</p>
              )}
            </div>
          </>
        )}

        {activeTab === "ocr" && (
          <>
            <div className="grid gap-3 lg:grid-cols-2">
              <div className="lg:col-span-2">
                <Field
                  label="Vision Model Base URL"
                  value={settings.visionModelBaseUrl || DEFAULT_OCR_BASE_URL}
                  onChange={(v) => updateField("visionModelBaseUrl", v)}
                  placeholder={DEFAULT_OCR_BASE_URL}
                />
              </div>
              <Field label="Vision Model API Key" type="password" value={settings.visionModelApiKey} onChange={(v) => updateField("visionModelApiKey", v)} placeholder="请输入 API Key" />
              <Field
                label="Vision Model Name"
                value={settings.visionModelName || DEFAULT_OCR_MODEL_NAME}
                onChange={(v) => updateField("visionModelName", v)}
                placeholder={DEFAULT_OCR_MODEL_NAME}
                hint="火山方舟用模型 ID，如 doubao-1-5-vision-pro-32k-250115"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2 pt-2">
              <SaveBtn saving={saving} onSave={handleSave} />
              <BatchOcrBtn />
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

function FlomoTestBtn({ webhookUrl }: { webhookUrl: string }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState("");

  async function handleTest() {
    if (!webhookUrl.trim()) {
      setResult("请先填写 Webhook URL");
      return;
    }
    setLoading(true);
    setResult("");
    try {
      const res = await fetch("/api/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: "flomo", webhookUrl: webhookUrl.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setResult(data.message || "测试成功，已发送到 flomo");
      } else {
        setResult(data.message || data.error || "测试失败");
      }
    } catch {
      setResult("网络请求失败，请稍后重试");
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
      {result && (
        <span className={result.startsWith("测试成功") || result.startsWith("已发送") ? "text-xs text-emerald-500" : "text-xs text-rose-500"}>
          {result}
        </span>
      )}
    </div>
  );
}

function ImageCacheUsage() {
  const [usage, setUsage] = useState<{ count: number; estimatedQuota?: number } | null>(null);
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getImageCacheUsage().then((u) => { if (!cancelled) setUsage(u); });
    return () => { cancelled = true; };
  }, []);

  async function handleClear() {
    if (!confirm("确定清空本地图片缓存？再次查看记录时图片会重新加载。")) return;
    setClearing(true);
    try {
      await clearImageCache();
      const u = await getImageCacheUsage();
      setUsage(u);
    } finally {
      setClearing(false);
    }
  }

  if (usage === null) return null;
  return (
    <div className="rounded-lg border border-[var(--line)] bg-[var(--surface)] px-4 py-3">
      <p className="text-xs font-medium text-[var(--muted)]">本地图片缓存</p>
      <p className="mt-0.5 text-sm text-[var(--foreground)]">
        已缓存 <span className="font-medium">{usage.count}</span> 张图片
        {usage.estimatedQuota != null && (
          <span className="ml-2 text-[var(--muted)]">· 本页可用配额约 {usage.estimatedQuota} MB</span>
        )}
      </p>
      <button
        type="button"
        onClick={handleClear}
        disabled={usage.count === 0 || clearing}
        className="mt-2 rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs text-[var(--muted-strong)] transition hover:bg-[var(--surface-strong)] disabled:opacity-50"
      >
        {clearing ? "清空中..." : "清空缓存"}
      </button>
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

      <div className="border-t border-[var(--line)] pt-4">
        <ImageCacheUsage />
      </div>
    </div>
  );
}
