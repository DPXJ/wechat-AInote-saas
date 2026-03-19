/**
 * 附件存储：实际文件写入 OSS 或本地磁盘，数据库只存引用（storage_key）。
 * storage_key 格式：oss:${objectKey} 或 local:${相对路径}；读取时由 readStoredUpload 根据前缀解析并返回 URL 或 buffer。
 */
import OSS from "ali-oss";
import fs from "node:fs/promises";
import path from "node:path";
import { appConfig, paths } from "@/lib/config";
import { getIntegrationSettings } from "@/lib/settings";
import type { IntegrationSettings } from "@/lib/types";
import { createId, sanitizeFileName } from "@/lib/utils";

type OssConfig = {
  region: string;
  bucket: string;
  endpoint?: string;
  accessKeyId: string;
  accessKeySecret: string;
  pathPrefix?: string;
  publicBaseUrl?: string;
};

function hasOssConfig(c: OssConfig) {
  return Boolean(c.region && c.bucket && c.accessKeyId && c.accessKeySecret);
}

function toOssConfig(s: IntegrationSettings): OssConfig {
  return {
    region: s.ossRegion || "",
    bucket: s.ossBucket || "",
    endpoint: s.ossEndpoint || undefined,
    accessKeyId: s.ossAccessKeyId || "",
    accessKeySecret: s.ossAccessKeySecret || "",
    pathPrefix: s.ossPathPrefix || "",
    publicBaseUrl: s.ossPublicBaseUrl || "",
  };
}

function appConfigToOss(): OssConfig {
  return {
    region: appConfig.ossRegion || "",
    bucket: appConfig.ossBucket || "",
    endpoint: appConfig.ossEndpoint || undefined,
    accessKeyId: appConfig.ossAccessKeyId || "",
    accessKeySecret: appConfig.ossAccessKeySecret || "",
    pathPrefix: appConfig.ossPathPrefix || "",
    publicBaseUrl: appConfig.ossPublicBaseUrl || "",
  };
}

async function getStorageConfig(userId?: string): Promise<{
  useOss: boolean;
  oss: OssConfig;
}> {
  const fromEnv = appConfigToOss();
  const envHasOss =
    appConfig.storageMode === "oss" && hasOssConfig(fromEnv);

  if (envHasOss) {
    return { useOss: true, oss: fromEnv };
  }

  if (userId) {
    const settings = await getIntegrationSettings(userId);
    const fromSettings = toOssConfig(settings);
    const settingsHasOss =
      settings.storageMode === "oss" && hasOssConfig(fromSettings);
    if (settingsHasOss) {
      return { useOss: true, oss: fromSettings };
    }
  }

  return { useOss: false, oss: fromEnv };
}

function createOssClient(oss: OssConfig) {
  return new OSS({
    region: oss.region,
    endpoint: oss.endpoint || undefined,
    bucket: oss.bucket,
    accessKeyId: oss.accessKeyId,
    accessKeySecret: oss.accessKeySecret,
    secure: true,
  });
}

function mimeToFolder(mimeType?: string): string {
  if (!mimeType) return "others";
  if (mimeType.startsWith("image/")) return "images";
  if (mimeType.startsWith("video/")) return "videos";
  if (mimeType.startsWith("audio/")) return "audios";
  if (
    mimeType.startsWith("application/pdf") ||
    mimeType.startsWith("application/msword") ||
    mimeType.startsWith("application/vnd.openxmlformats") ||
    mimeType.startsWith("application/vnd.ms-") ||
    mimeType.startsWith("text/")
  )
    return "documents";
  return "others";
}

function buildObjectKey(
  fileId: string,
  originalName: string,
  mimeType?: string,
  pathPrefix?: string,
) {
  const safeName = sanitizeFileName(originalName || "upload.bin") || "upload.bin";
  const datePrefix = new Date().toISOString().slice(0, 10);
  const prefix = (pathPrefix || appConfig.ossPathPrefix || "").trim().replace(/^\/+|\/+$/g, "");
  const typeFolder = mimeToFolder(mimeType);

  return [prefix, typeFolder, datePrefix, `${fileId}-${safeName}`].filter(Boolean).join("/");
}

function joinUrl(base: string, key: string) {
  return `${base.replace(/\/+$/g, "")}/${key.replace(/^\/+/g, "")}`;
}

export async function storeUpload(
  buffer: Buffer,
  originalName: string,
  mimeType?: string,
  userId?: string,
) {
  const fileId = createId("asset");
  const { useOss, oss } = await getStorageConfig(userId);
  const objectKey = buildObjectKey(fileId, originalName, mimeType, oss.pathPrefix);

  if (useOss) {
    const client = createOssClient(oss);
    await client.put(objectKey, buffer, { mime: mimeType });
    return { fileId, storageKey: `oss:${objectKey}`, absolutePath: "" };
  }

  const objectKeyLocal = buildObjectKey(fileId, originalName, mimeType);
  const absolutePath = path.join(paths.uploadsDir, objectKeyLocal);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, buffer);
  return { fileId, storageKey: `local:${objectKeyLocal}`, absolutePath };
}

export async function deleteStoredUpload(storageKey: string, userId?: string) {
  if (storageKey.startsWith("oss:")) {
    const objectKey = storageKey.replace(/^oss:/, "");
    try {
      const { oss } = await getStorageConfig(userId);
      if (hasOssConfig(oss)) {
        const client = createOssClient(oss);
        await client.delete(objectKey);
      }
    } catch {
      // best-effort
    }
    return;
  }

  const resolvedKey = storageKey.replace(/^local:/, "");
  try {
    await fs.unlink(path.join(paths.uploadsDir, resolvedKey));
  } catch {
    // best-effort
  }
}

export async function readStoredUpload(
  storageKey: string,
  options?: { download?: boolean; fileName?: string; thumbnail?: boolean },
  userId?: string,
) {
  if (storageKey.startsWith("oss:")) {
    const objectKey = storageKey.replace(/^oss:/, "");
    const { oss } = await getStorageConfig(userId);
    if (!hasOssConfig(oss)) {
      throw new Error("OSS 未配置，无法读取已存储的 OSS 文件");
    }
    const client = createOssClient(oss);

    if (oss.publicBaseUrl) {
      let url = joinUrl(oss.publicBaseUrl, objectKey);
      if (options?.thumbnail) {
        url += "?x-oss-process=image/resize,m_fill,w_480,h_320";
      }
      return { kind: "redirect" as const, url };
    }

    const signOptions: Record<string, unknown> = { expires: 3600 };
    if (options?.download && options.fileName) {
      signOptions.response = {
        "content-disposition": `attachment; filename="${encodeURIComponent(options.fileName)}"`,
      };
    }
    if (options?.thumbnail) {
      signOptions.process = "image/resize,m_fill,w_480,h_320";
    }

    return {
      kind: "redirect" as const,
      url: client.signatureUrl(objectKey, signOptions),
    };
  }

  const resolvedKey = storageKey.replace(/^local:/, "");
  const buffer = await fs.readFile(path.join(paths.uploadsDir, resolvedKey));
  return { kind: "buffer" as const, buffer };
}
