import OSS from "ali-oss";
import fs from "node:fs/promises";
import path from "node:path";
import { paths } from "@/lib/config";
import { getIntegrationSettings } from "@/lib/settings";
import { createId, sanitizeFileName } from "@/lib/utils";

function hasOssSettings() {
  const settings = getIntegrationSettings();
  return Boolean(
    settings.storageMode === "oss" &&
      settings.ossRegion &&
      settings.ossBucket &&
      settings.ossAccessKeyId &&
      settings.ossAccessKeySecret,
  );
}

function createOssClient() {
  const settings = getIntegrationSettings();

  return new OSS({
    region: settings.ossRegion,
    endpoint: settings.ossEndpoint || undefined,
    bucket: settings.ossBucket,
    accessKeyId: settings.ossAccessKeyId,
    accessKeySecret: settings.ossAccessKeySecret,
    secure: true,
  });
}

function buildObjectKey(fileId: string, originalName: string) {
  const settings = getIntegrationSettings();
  const safeName = sanitizeFileName(originalName || "upload.bin") || "upload.bin";
  const datePrefix = new Date().toISOString().slice(0, 10);
  const prefix = settings.ossPathPrefix.trim().replace(/^\/+|\/+$/g, "");

  return [prefix, datePrefix, `${fileId}-${safeName}`].filter(Boolean).join("/");
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
  const objectKey = buildObjectKey(fileId, originalName);

  if (hasOssSettings()) {
    const client = createOssClient();
    await client.put(objectKey, buffer, {
      mime: mimeType,
    });

    return {
      fileId,
      storageKey: `oss:${objectKey}`,
      absolutePath: "",
    };
  }

  const absolutePath = path.join(paths.uploadsDir, objectKey);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, buffer);

  return {
    fileId,
    storageKey: `local:${objectKey}`,
    absolutePath,
  };
}

export async function readStoredUpload(storageKey: string) {
  const settings = getIntegrationSettings();

  if (storageKey.startsWith("oss:")) {
    const objectKey = storageKey.replace(/^oss:/, "");
    const client = createOssClient();
    const url = settings.ossPublicBaseUrl
      ? joinUrl(settings.ossPublicBaseUrl, objectKey)
      : client.signatureUrl(objectKey, { expires: 3600 });

    return {
      kind: "redirect" as const,
      url,
    };
  }

  const resolvedKey = storageKey.replace(/^local:/, "");
  const buffer = await fs.readFile(path.join(paths.uploadsDir, resolvedKey));

  return {
    kind: "buffer" as const,
    buffer,
  };
}
