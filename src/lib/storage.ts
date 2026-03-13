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

export async function deleteStoredUpload(storageKey: string) {
  if (storageKey.startsWith("oss:")) {
    const objectKey = storageKey.replace(/^oss:/, "");
    try {
      const client = createOssClient();
      await client.delete(objectKey);
    } catch {
      // best-effort: file may already be gone
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
  const settings = getIntegrationSettings();

  if (storageKey.startsWith("oss:")) {
    const objectKey = storageKey.replace(/^oss:/, "");
    const client = createOssClient();

    if (settings.ossPublicBaseUrl) {
      let url = joinUrl(settings.ossPublicBaseUrl, objectKey);
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

  return {
    kind: "buffer" as const,
    buffer,
  };
}
