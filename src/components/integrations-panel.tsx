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
    const statusResponse = await fetch("/api/integrations");
    const statusPayload = await statusResponse.json();
    setStatus(statusPayload.status);
    setMessage("配置已保存。现在可以继续做连通性测试。");
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
    setStatus(payload.status || status);

    if (!response.ok) {
      setMessage(payload.error || "测试失败。");
      return;
    }

    setMessage(payload.message || `${actionLabels[target]}通过。`);
  }

  return (
    <section className="rounded-[32px] border border-stone-300 bg-white/85 p-6 shadow-[0_24px_90px_rgba(73,52,42,0.08)]">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs tracking-[0.32em] text-stone-500">连接配置</p>
          <h2 className="mt-2 font-serif text-2xl text-stone-950">
            把同步目标一次配好
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-7 text-stone-600">
            配置保存在本地 SQLite。首页的主任务仍然是录入资料，这里只负责把
            Notion、滴答邮箱和 OSS 接起来。
          </p>
        </div>
        <button
          type="button"
          onClick={saveSettings}
          disabled={saving || Boolean(busy)}
          className="rounded-full border border-stone-300 px-5 py-2 text-sm transition hover:border-stone-700 disabled:cursor-not-allowed disabled:border-stone-200 disabled:text-stone-400"
        >
          {saving ? "保存中..." : "只保存配置"}
        </button>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <StatusCard title="资料存储" item={status.storage} />
        <StatusCard title="Notion" item={status.notion} />
        <StatusCard title="SMTP" item={status.smtp} />
        <StatusCard title="滴答邮箱" item={status.ticktickEmail} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_1fr]">
        <section className="space-y-6">
          <ConfigBlock
            title="资料存储"
            description="文本、索引和同步记录保留在系统数据库里；图片、视频、文档附件可以放本地，也可以切到 OSS。"
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

            <p className="text-xs text-stone-500">
              当前模式：{settings.storageMode === "oss" ? "阿里云 OSS" : "本地存储"}
            </p>

            {settings.storageMode === "oss" ? (
              <div className="grid gap-4 md:grid-cols-2">
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
                <div className="md:col-span-2">
                  <InputField
                    label="公网访问域名"
                    value={settings.ossPublicBaseUrl}
                    onChange={(value) => updateField("ossPublicBaseUrl", value)}
                    placeholder="可选，例如 https://cdn.example.com"
                  />
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-stone-200 bg-white px-4 py-4 text-sm leading-7 text-stone-600">
                本地模式更适合快速启动。后续如果图片、视频和 PDF 变多，再切到 OSS
                即可。
              </div>
            )}

            <ActionButton
              onClick={() => runTest("oss")}
              disabled={saving || Boolean(busy) || settings.storageMode !== "oss"}
              active={busy === "oss"}
              label={busy === "oss" ? "测试中..." : "保存并测试 OSS"}
            />
          </ConfigBlock>

          <ConfigBlock
            title="Notion"
            description="把有沉淀价值的资料同步成页面，适合做资料库和后续整理。"
          >
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
            <ActionButton
              onClick={() => runTest("notion")}
              disabled={saving || Boolean(busy)}
              active={busy === "notion"}
              label={busy === "notion" ? "测试中..." : "保存并测试 Notion"}
            />
          </ConfigBlock>
        </section>

        <section>
          <ConfigBlock
            title="滴答清单邮箱"
            description="待办走邮箱投递最稳。先测 SMTP，再发一封滴答测试邮件。"
          >
            <div className="grid gap-4 md:grid-cols-2">
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
            </div>
            <div className="grid gap-4 md:grid-cols-2">
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
            </div>
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

            <label className="flex items-center gap-3 rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-700">
              <input
                type="checkbox"
                checked={settings.smtpSecure}
                onChange={(event) => updateField("smtpSecure", event.target.checked)}
              />
              使用 SSL / TLS 直连
            </label>

            <div className="flex flex-wrap gap-3">
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
                  busy === "ticktick-email"
                    ? "发送中..."
                    : "保存并发送滴答测试邮件"
                }
              />
            </div>
            <p className="text-xs leading-6 text-stone-500">
              “发送滴答测试邮件”会真的创建一条测试任务，验证完成后可以去滴答里删除。
            </p>
          </ConfigBlock>
        </section>
      </div>

      {message ? (
        <p className="mt-5 rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-700">
          {message}
        </p>
      ) : null}
    </section>
  );
}

function StatusCard({
  title,
  item,
}: {
  title: string;
  item: { configured: boolean; label: string };
}) {
  return (
    <div className="rounded-[22px] border border-stone-200 bg-stone-50 p-4">
      <p className="text-xs tracking-[0.24em] text-stone-500">{title}</p>
      <p className="mt-2 text-sm text-stone-700">{item.label}</p>
      <p className="mt-2 text-xs text-stone-500">
        {item.configured ? "已完成基础配置" : "还需要补充参数"}
      </p>
    </div>
  );
}

function ConfigBlock({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[28px] border border-stone-200 bg-stone-50 p-5">
      <p className="text-xs tracking-[0.24em] text-stone-500">{title}</p>
      <p className="mt-2 text-sm leading-7 text-stone-600">{description}</p>
      <div className="mt-5 space-y-4">{children}</div>
    </section>
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
        "rounded-full px-4 py-2 text-sm transition",
        active
          ? "bg-stone-950 text-stone-50"
          : "border border-stone-300 bg-white text-stone-700 hover:border-stone-700",
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
        "rounded-full px-4 py-2 text-sm transition disabled:cursor-not-allowed",
        primary
          ? "bg-stone-950 text-stone-50 hover:bg-stone-800 disabled:bg-stone-400"
          : "border border-stone-300 text-stone-700 hover:border-stone-700 disabled:border-stone-200 disabled:text-stone-400",
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
    <label className="space-y-2">
      <span className="text-xs tracking-[0.22em] text-stone-500">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-stone-500"
      />
    </label>
  );
}
