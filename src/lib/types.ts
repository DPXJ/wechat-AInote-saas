export type RecordType =
  | "text"
  | "image"
  | "pdf"
  | "document"
  | "audio"
  | "video"
  | "mixed";

export type SyncTarget = "notion" | "ticktick-email" | "feishu-doc";

export type SyncStatus = "pending" | "synced" | "failed";

export interface RecordAsset {
  id: string;
  recordId: string;
  originalName: string;
  mimeType: string;
  byteSize: number;
  storageKey: string;
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
}

export interface RecordInput {
  title?: string;
  sourceLabel?: string;
  contextNote?: string;
  contentText?: string;
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

export interface IntegrationSettings {
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
