export type RecordType =
  | "text"
  | "image"
  | "pdf"
  | "document"
  | "audio"
  | "video"
  | "mixed";

export type SyncTarget = "notion" | "ticktick-email" | "feishu-doc" | "flomo";

export type SyncStatus = "pending" | "synced" | "failed";

export interface RecordAsset {
  id: string;
  recordId: string;
  originalName: string;
  mimeType: string;
  byteSize: number;
  /** 存储引用：格式为 oss:${objectKey} 或 local:${相对路径}。数据库只存此 key，不存文件二进制；实际文件在 OSS 或本地磁盘，通过 readStoredUpload(storageKey) 读取。 */
  storageKey: string;
  tags: string[];
  description: string;
  ocrText: string;
  createdAt: string;
}

export interface SyncRun {
  id: string;
  recordId: string;
  target: SyncTarget;
  status: SyncStatus;
  externalRef: string | null;
  payload: Record<string, unknown>;
  message: string;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeRecord {
  id: string;
  title: string;
  sourceLabel: string;
  sourceChannel: string;
  recordType: RecordType;
  contentText: string;
  extractedText: string;
  summary: string;
  contextNote: string;
  keywords: string[];
  actionItems: string[];
  suggestedTargets: SyncTarget[];
  createdAt: string;
  updatedAt: string;
  assets: RecordAsset[];
  syncRuns: SyncRun[];
  /** 非空表示已确认为可关联项目的信源 */
  confirmedAt?: string | null;
  /** 仅回收站列表返回：删除时间 */
  deletedAt?: string;
}

export interface RecordInput {
  title?: string;
  sourceLabel?: string;
  contextNote?: string;
  contentText?: string;
  recordTypeHint?: RecordType;
  userTags?: string[];
}

export interface StoredUpload {
  originalName: string;
  mimeType: string;
  byteSize: number;
  buffer: Buffer;
}

export interface AnalysisInput {
  title: string;
  sourceLabel: string;
  recordType: RecordType;
  contentText: string;
  extractedText: string;
  contextNote: string;
  assetNames: string[];
}

export interface AnalysisOutput {
  title?: string;
  summary: string;
  keywords: string[];
  actionItems: string[];
  suggestedTargets: SyncTarget[];
}

export interface SearchCitation {
  recordId: string;
  title: string;
  sourceLabel: string;
  snippet: string;
  reason: string;
  score: number;
}

export interface SearchResponse {
  answer: string;
  citations: SearchCitation[];
}

export type TodoPriority = "low" | "medium" | "high" | "urgent";
export type TodoStatus = "pending" | "done" | "deleted";

export interface Todo {
  id: string;
  recordId: string | null;
  content: string;
  priority: TodoPriority;
  status: TodoStatus;
  createdAt: string;
  completedAt: string | null;
  updatedAt: string;
  deletedAt: string | null;
  syncedAt: string | null;
}

/** 闪念来源：flomo 同步、HTTP 接入、本应用内新建 */
export type FlashMemoSource = "flomo" | "api" | "web";

export interface FlashMemo {
  id: string;
  content: string;
  source: FlashMemoSource;
  externalId: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface StatsData {
  totalRecords: number;
  todayRecords: number;
  imageCount: number;
  textCount: number;
  videoCount: number;
  documentCount: number;
  totalTodos: number;
  todayTodos: number;
  pendingTodos: number;
  urgentTodos: number;
}

export type AiProvider = "openai" | "glm" | "deepseek" | "";

export interface IntegrationSettings {
  aiProvider: AiProvider;
  aiApiKey: string;
  aiSummaryPrompt: string;
  aiTodoPrompt: string;
  storageMode: "local" | "oss";
  notionToken: string;
  notionParentPageId: string;
  smtpHost: string;
  smtpPort: string;
  smtpSecure: boolean;
  smtpUser: string;
  smtpPass: string;
  smtpFrom: string;
  tickTickInboxEmail: string;
  ossRegion: string;
  ossBucket: string;
  ossEndpoint: string;
  ossAccessKeyId: string;
  ossAccessKeySecret: string;
  ossPathPrefix: string;
  ossPublicBaseUrl: string;
  visionModelBaseUrl: string;
  visionModelApiKey: string;
  visionModelName: string;
  ocrEnabled: boolean;
  imapHost: string;
  imapPort: string;
  imapUser: string;
  imapPass: string;
  imapSecure: boolean;
  flomoWebhookUrl: string;
  /** 用于 POST /api/flash-memos/ingest 的 Bearer 令牌；在设置中生成 */
  flashMemoIngestToken: string;
}

export interface IntegrationStatusItem {
  configured: boolean;
  label: string;
}

export interface IntegrationStatus {
  storage: IntegrationStatusItem;
  notion: IntegrationStatusItem;
  smtp: IntegrationStatusItem;
  ticktickEmail: IntegrationStatusItem;
}

export interface NotionSyncPreview {
  title: string;
  summary: string;
  highlights: string[];
  body: string;
}

export interface TickTickSyncPreview {
  subject: string;
  body: string;
}
