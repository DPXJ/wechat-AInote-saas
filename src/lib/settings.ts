import { appConfig } from "@/lib/config";
import { getDb } from "@/lib/db";
import type { IntegrationSettings } from "@/lib/types";
import { nowIso } from "@/lib/utils";

const settingKeys = [
  "storageMode",
  "notionToken",
  "notionParentPageId",
  "smtpHost",
  "smtpPort",
  "smtpSecure",
  "smtpUser",
  "smtpPass",
  "smtpFrom",
  "tickTickInboxEmail",
  "ossRegion",
  "ossBucket",
  "ossEndpoint",
  "ossAccessKeyId",
  "ossAccessKeySecret",
  "ossPathPrefix",
  "ossPublicBaseUrl",
  "visionModelBaseUrl",
  "visionModelApiKey",
  "visionModelName",
  "ocrEnabled",
  "imapHost",
  "imapPort",
  "imapUser",
  "imapPass",
  "imapSecure",
] as const;

type SettingKey = (typeof settingKeys)[number];

const envDefaults: IntegrationSettings = {
  storageMode: appConfig.storageMode === "oss" ? "oss" : "local",
  notionToken: appConfig.notionToken,
  notionParentPageId: appConfig.notionParentPageId,
  smtpHost: appConfig.smtpHost,
  smtpPort: String(appConfig.smtpPort),
  smtpSecure: appConfig.smtpSecure,
  smtpUser: appConfig.smtpUser,
  smtpPass: appConfig.smtpPass,
  smtpFrom: appConfig.smtpFrom,
  tickTickInboxEmail: appConfig.tickTickInboxEmail,
  ossRegion: appConfig.ossRegion,
  ossBucket: appConfig.ossBucket,
  ossEndpoint: appConfig.ossEndpoint,
  ossAccessKeyId: appConfig.ossAccessKeyId,
  ossAccessKeySecret: appConfig.ossAccessKeySecret,
  ossPathPrefix: appConfig.ossPathPrefix,
  ossPublicBaseUrl: appConfig.ossPublicBaseUrl,
  visionModelBaseUrl: "",
  visionModelApiKey: "",
  visionModelName: "",
  ocrEnabled: false,
  imapHost: "",
  imapPort: "993",
  imapUser: "",
  imapPass: "",
  imapSecure: true,
};

function normalizeBoolean(value: string | boolean | null | undefined) {
  if (typeof value === "boolean") {
    return value;
  }

  return value === "true";
}

export function getIntegrationSettings(): IntegrationSettings {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT key, value FROM settings WHERE key IN (${settingKeys.map(() => "?").join(", ")})`,
    )
    .all(...settingKeys) as Array<{ key: SettingKey; value: string }>;

  const stored = new Map(rows.map((row) => [row.key, row.value]));

  return {
    storageMode:
      stored.get("storageMode") === "oss" ? "oss" : envDefaults.storageMode,
    notionToken: stored.get("notionToken") ?? envDefaults.notionToken,
    notionParentPageId:
      stored.get("notionParentPageId") ?? envDefaults.notionParentPageId,
    smtpHost: stored.get("smtpHost") ?? envDefaults.smtpHost,
    smtpPort: stored.get("smtpPort") ?? envDefaults.smtpPort,
    smtpSecure: normalizeBoolean(
      stored.get("smtpSecure") ?? String(envDefaults.smtpSecure),
    ),
    smtpUser: stored.get("smtpUser") ?? envDefaults.smtpUser,
    smtpPass: stored.get("smtpPass") ?? envDefaults.smtpPass,
    smtpFrom: stored.get("smtpFrom") ?? envDefaults.smtpFrom,
    tickTickInboxEmail:
      stored.get("tickTickInboxEmail") ?? envDefaults.tickTickInboxEmail,
    ossRegion: stored.get("ossRegion") ?? envDefaults.ossRegion,
    ossBucket: stored.get("ossBucket") ?? envDefaults.ossBucket,
    ossEndpoint: stored.get("ossEndpoint") ?? envDefaults.ossEndpoint,
    ossAccessKeyId:
      stored.get("ossAccessKeyId") ?? envDefaults.ossAccessKeyId,
    ossAccessKeySecret:
      stored.get("ossAccessKeySecret") ?? envDefaults.ossAccessKeySecret,
    ossPathPrefix: stored.get("ossPathPrefix") ?? envDefaults.ossPathPrefix,
    ossPublicBaseUrl:
      stored.get("ossPublicBaseUrl") ?? envDefaults.ossPublicBaseUrl,
    visionModelBaseUrl:
      stored.get("visionModelBaseUrl") ?? envDefaults.visionModelBaseUrl,
    visionModelApiKey:
      stored.get("visionModelApiKey") ?? envDefaults.visionModelApiKey,
    visionModelName:
      stored.get("visionModelName") ?? envDefaults.visionModelName,
    ocrEnabled: normalizeBoolean(
      stored.get("ocrEnabled") ?? String(envDefaults.ocrEnabled),
    ),
    imapHost: stored.get("imapHost") ?? envDefaults.imapHost,
    imapPort: stored.get("imapPort") ?? envDefaults.imapPort,
    imapUser: stored.get("imapUser") ?? envDefaults.imapUser,
    imapPass: stored.get("imapPass") ?? envDefaults.imapPass,
    imapSecure: normalizeBoolean(
      stored.get("imapSecure") ?? String(envDefaults.imapSecure),
    ),
  };
}

export function saveIntegrationSettings(input: IntegrationSettings) {
  const db = getDb();
  const statement = db.prepare(`
    INSERT INTO settings (key, value, updated_at)
    VALUES (@key, @value, @updated_at)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = excluded.updated_at
  `);
  const updatedAt = nowIso();

  const transaction = db.transaction(() => {
    statement.run({
      key: "storageMode",
      value: input.storageMode,
      updated_at: updatedAt,
    });
    statement.run({
      key: "notionToken",
      value: input.notionToken.trim(),
      updated_at: updatedAt,
    });
    statement.run({
      key: "notionParentPageId",
      value: input.notionParentPageId.trim(),
      updated_at: updatedAt,
    });
    statement.run({
      key: "smtpHost",
      value: input.smtpHost.trim(),
      updated_at: updatedAt,
    });
    statement.run({
      key: "smtpPort",
      value: input.smtpPort.trim(),
      updated_at: updatedAt,
    });
    statement.run({
      key: "smtpSecure",
      value: String(input.smtpSecure),
      updated_at: updatedAt,
    });
    statement.run({
      key: "smtpUser",
      value: input.smtpUser.trim(),
      updated_at: updatedAt,
    });
    statement.run({
      key: "smtpPass",
      value: input.smtpPass,
      updated_at: updatedAt,
    });
    statement.run({
      key: "smtpFrom",
      value: input.smtpFrom.trim(),
      updated_at: updatedAt,
    });
    statement.run({
      key: "tickTickInboxEmail",
      value: input.tickTickInboxEmail.trim(),
      updated_at: updatedAt,
    });
    statement.run({
      key: "ossRegion",
      value: input.ossRegion.trim(),
      updated_at: updatedAt,
    });
    statement.run({
      key: "ossBucket",
      value: input.ossBucket.trim(),
      updated_at: updatedAt,
    });
    statement.run({
      key: "ossEndpoint",
      value: input.ossEndpoint.trim(),
      updated_at: updatedAt,
    });
    statement.run({
      key: "ossAccessKeyId",
      value: input.ossAccessKeyId.trim(),
      updated_at: updatedAt,
    });
    statement.run({
      key: "ossAccessKeySecret",
      value: input.ossAccessKeySecret,
      updated_at: updatedAt,
    });
    statement.run({
      key: "ossPathPrefix",
      value: input.ossPathPrefix.trim(),
      updated_at: updatedAt,
    });
    statement.run({
      key: "ossPublicBaseUrl",
      value: input.ossPublicBaseUrl.trim(),
      updated_at: updatedAt,
    });
    statement.run({
      key: "visionModelBaseUrl",
      value: input.visionModelBaseUrl.trim(),
      updated_at: updatedAt,
    });
    statement.run({
      key: "visionModelApiKey",
      value: input.visionModelApiKey,
      updated_at: updatedAt,
    });
    statement.run({
      key: "visionModelName",
      value: input.visionModelName.trim(),
      updated_at: updatedAt,
    });
    statement.run({
      key: "ocrEnabled",
      value: String(input.ocrEnabled),
      updated_at: updatedAt,
    });
    statement.run({
      key: "imapHost",
      value: (input.imapHost || "").trim(),
      updated_at: updatedAt,
    });
    statement.run({
      key: "imapPort",
      value: (input.imapPort || "993").trim(),
      updated_at: updatedAt,
    });
    statement.run({
      key: "imapUser",
      value: (input.imapUser || "").trim(),
      updated_at: updatedAt,
    });
    statement.run({
      key: "imapPass",
      value: input.imapPass || "",
      updated_at: updatedAt,
    });
    statement.run({
      key: "imapSecure",
      value: String(input.imapSecure ?? true),
      updated_at: updatedAt,
    });
  });

  transaction();
  return getIntegrationSettings();
}
