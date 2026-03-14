import { appConfig } from "@/lib/config";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
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
  if (typeof value === "boolean") return value;
  return value === "true";
}

export async function getIntegrationSettings(userId: string): Promise<IntegrationSettings> {
  const { data: rows } = await getSupabaseAdmin()
    .from("settings")
    .select("key, value")
    .eq("user_id", userId)
    .in("key", [...settingKeys]);

  const stored = new Map((rows || []).map((row: { key: string; value: string }) => [row.key as SettingKey, row.value]));

  return {
    storageMode: stored.get("storageMode") === "oss" ? "oss" : envDefaults.storageMode,
    notionToken: stored.get("notionToken") ?? envDefaults.notionToken,
    notionParentPageId: stored.get("notionParentPageId") ?? envDefaults.notionParentPageId,
    smtpHost: stored.get("smtpHost") ?? envDefaults.smtpHost,
    smtpPort: stored.get("smtpPort") ?? envDefaults.smtpPort,
    smtpSecure: normalizeBoolean(stored.get("smtpSecure") ?? String(envDefaults.smtpSecure)),
    smtpUser: stored.get("smtpUser") ?? envDefaults.smtpUser,
    smtpPass: stored.get("smtpPass") ?? envDefaults.smtpPass,
    smtpFrom: stored.get("smtpFrom") ?? envDefaults.smtpFrom,
    tickTickInboxEmail: stored.get("tickTickInboxEmail") ?? envDefaults.tickTickInboxEmail,
    ossRegion: stored.get("ossRegion") ?? envDefaults.ossRegion,
    ossBucket: stored.get("ossBucket") ?? envDefaults.ossBucket,
    ossEndpoint: stored.get("ossEndpoint") ?? envDefaults.ossEndpoint,
    ossAccessKeyId: stored.get("ossAccessKeyId") ?? envDefaults.ossAccessKeyId,
    ossAccessKeySecret: stored.get("ossAccessKeySecret") ?? envDefaults.ossAccessKeySecret,
    ossPathPrefix: stored.get("ossPathPrefix") ?? envDefaults.ossPathPrefix,
    ossPublicBaseUrl: stored.get("ossPublicBaseUrl") ?? envDefaults.ossPublicBaseUrl,
    visionModelBaseUrl: stored.get("visionModelBaseUrl") ?? envDefaults.visionModelBaseUrl,
    visionModelApiKey: stored.get("visionModelApiKey") ?? envDefaults.visionModelApiKey,
    visionModelName: stored.get("visionModelName") ?? envDefaults.visionModelName,
    ocrEnabled: normalizeBoolean(stored.get("ocrEnabled") ?? String(envDefaults.ocrEnabled)),
    imapHost: stored.get("imapHost") ?? envDefaults.imapHost,
    imapPort: stored.get("imapPort") ?? envDefaults.imapPort,
    imapUser: stored.get("imapUser") ?? envDefaults.imapUser,
    imapPass: stored.get("imapPass") ?? envDefaults.imapPass,
    imapSecure: normalizeBoolean(stored.get("imapSecure") ?? String(envDefaults.imapSecure)),
  };
}

export async function saveIntegrationSettings(userId: string, input: IntegrationSettings) {
  const supabase = getSupabaseAdmin();
  const updatedAt = nowIso();

  const entries: Array<{ key: string; value: string }> = [
    { key: "storageMode", value: input.storageMode },
    { key: "notionToken", value: input.notionToken.trim() },
    { key: "notionParentPageId", value: input.notionParentPageId.trim() },
    { key: "smtpHost", value: input.smtpHost.trim() },
    { key: "smtpPort", value: input.smtpPort.trim() },
    { key: "smtpSecure", value: String(input.smtpSecure) },
    { key: "smtpUser", value: input.smtpUser.trim() },
    { key: "smtpPass", value: input.smtpPass },
    { key: "smtpFrom", value: input.smtpFrom.trim() },
    { key: "tickTickInboxEmail", value: input.tickTickInboxEmail.trim() },
    { key: "ossRegion", value: input.ossRegion.trim() },
    { key: "ossBucket", value: input.ossBucket.trim() },
    { key: "ossEndpoint", value: input.ossEndpoint.trim() },
    { key: "ossAccessKeyId", value: input.ossAccessKeyId.trim() },
    { key: "ossAccessKeySecret", value: input.ossAccessKeySecret },
    { key: "ossPathPrefix", value: input.ossPathPrefix.trim() },
    { key: "ossPublicBaseUrl", value: input.ossPublicBaseUrl.trim() },
    { key: "visionModelBaseUrl", value: input.visionModelBaseUrl.trim() },
    { key: "visionModelApiKey", value: input.visionModelApiKey },
    { key: "visionModelName", value: input.visionModelName.trim() },
    { key: "ocrEnabled", value: String(input.ocrEnabled) },
    { key: "imapHost", value: (input.imapHost || "").trim() },
    { key: "imapPort", value: (input.imapPort || "993").trim() },
    { key: "imapUser", value: (input.imapUser || "").trim() },
    { key: "imapPass", value: input.imapPass || "" },
    { key: "imapSecure", value: String(input.imapSecure ?? true) },
  ];

  for (const entry of entries) {
    await supabase.from("settings").upsert(
      {
        user_id: userId,
        key: entry.key,
        value: entry.value,
        updated_at: updatedAt,
      },
      { onConflict: "user_id,key" },
    );
  }

  return getIntegrationSettings(userId);
}
