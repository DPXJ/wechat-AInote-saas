import OSS from "ali-oss";
import fs from "node:fs/promises";
import path from "node:path";
import { appConfig, paths } from "@/lib/config";
import { createId, sanitizeFileName } from "@/lib/utils";

function hasOssSettings() {
  return Boolean(
    appConfig.storageMode === "oss" &&
      appConfig.ossRegion &&
      appConfig.ossBucket &&
      appConfig.ossAccessKeyId &&
      appConfig.ossAccessKeySecret,
  );
}

function createOssClient() {
  return new OSS({
    region: appConfig.ossRegion,
    endpoint: appConfig.ossEndpoint || undefined,
    bucket: appConfig.ossBucket,
    accessKeyId: appConfig.ossAccessKeyId,
    accessKeySecret: appConfig.ossAccessKeySecret,
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

function buildObjectKey(fileId: string, originalName: string, mimeType?: string) {
  const safeName = sanitizeFileName(originalName || "upload.bin") || "upload.bin";
  const datePrefix = new Date().toISOString().slice(0, 10);
  const prefix = (appConfig.ossPathPrefix || "").trim().replace(/^\/+|\/+$/g, "");
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
) {
  const fileId = createId("asset");
  const objectKey = buildObjectKey(fileId, originalName, mimeType);

  if (hasOssSettings()) {
    const client = createOssClient();
    await client.put(objectKey, buffer, { mime: mimeType });
    return { fileId, storageKey: `oss:${objectKey}`, absolutePath: "" };
  }

  const absolutePath = path.join(paths.uploadsDir, objectKey);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, buffer);
  return { fileId, storageKey: `local:${objectKey}`, absolutePath };
}

export async function deleteStoredUpload(storageKey: string) {
  if (storageKey.startsWith("oss:")) {
    const objectKey = storageKey.replace(/^oss:/, "");
    try {
      const client = createOssClient();
      await client.delete(objectKey);
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
) {
  if (storageKey.startsWith("oss:")) {
    const objectKey = storageKey.replace(/^oss:/, "");
    const client = createOssClient();

    if (appConfig.ossPublicBaseUrl) {
      let url = joinUrl(appConfig.ossPublicBaseUrl, objectKey);
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
