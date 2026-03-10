import path from "node:path";

export const appConfig = {
  appName: "Signal Deck",
  appDescription: "AI inbox for files, notes, and searchable context.",
  baseUrl: process.env.APP_BASE_URL || "http://localhost:3000",
  dataRoot:
    process.env.DATA_ROOT ||
    path.join(process.cwd(), ".local-data", "signal-deck"),
  openAiApiKey: process.env.OPENAI_API_KEY || "",
  openAiTextModel: process.env.OPENAI_TEXT_MODEL || "",
  openAiEmbeddingModel: process.env.OPENAI_EMBEDDING_MODEL || "",
  notionToken: process.env.NOTION_TOKEN || "",
  notionParentPageId: process.env.NOTION_PARENT_PAGE_ID || "",
  smtpHost: process.env.SMTP_HOST || "",
  smtpPort: Number(process.env.SMTP_PORT || "587"),
  smtpSecure: process.env.SMTP_SECURE === "true",
  smtpUser: process.env.SMTP_USER || "",
  smtpPass: process.env.SMTP_PASS || "",
  smtpFrom: process.env.SMTP_FROM || "",
  tickTickInboxEmail: process.env.TICKTICK_INBOX_EMAIL || "",
  storageMode: process.env.STORAGE_MODE || "local",
  ossRegion: process.env.OSS_REGION || "",
  ossBucket: process.env.OSS_BUCKET || "",
  ossEndpoint: process.env.OSS_ENDPOINT || "",
  ossAccessKeyId: process.env.OSS_ACCESS_KEY_ID || "",
  ossAccessKeySecret: process.env.OSS_ACCESS_KEY_SECRET || "",
  ossPathPrefix: process.env.OSS_PATH_PREFIX || "",
  ossPublicBaseUrl: process.env.OSS_PUBLIC_BASE_URL || "",
};

export const paths = {
  uploadsDir: path.join(appConfig.dataRoot, "uploads"),
  dbFile: path.join(appConfig.dataRoot, "signal-deck.sqlite"),
};
