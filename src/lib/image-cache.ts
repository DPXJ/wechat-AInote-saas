/**
 * 客户端图片缓存：用 Cache API 缓存 /api/assets 的缩略图与原图，
 * 二次打开同一记录时优先从缓存显示，减少骨架屏时间。
 *
 * 缓存容量：浏览器对单源 Storage 有配额（通常为可用磁盘的约 50% 或数 GB），
 * 此处限制条目数（默认 200），超出时按加入顺序淘汰，避免单页占用过大。
 */

const CACHE_NAME = "ai-box-assets-v1";
const MAX_ENTRIES = 200;

function fullUrl(url: string): string {
  if (typeof window === "undefined") return url;
  if (url.startsWith("http")) return url;
  return window.location.origin + (url.startsWith("/") ? url : "/" + url);
}

export async function getCachedImage(url: string): Promise<Blob | null> {
  try {
    const cache = await caches.open(CACHE_NAME);
    const full = fullUrl(url);
    const res = await cache.match(full);
    if (!res || !res.ok) return null;
    return res.blob();
  } catch {
    return null;
  }
}

export async function setCachedImage(url: string, blob: Blob, mimeType?: string): Promise<void> {
  try {
    const cache = await caches.open(CACHE_NAME);
    const full = fullUrl(url);
    const headers = new Headers();
    headers.set("Content-Type", mimeType || "image/png");
    await cache.put(full, new Response(blob, { headers }));

    const keys = await cache.keys();
    if (keys.length > MAX_ENTRIES) {
      const toRemove = keys.length - MAX_ENTRIES;
      for (let i = 0; i < toRemove; i++) {
        await cache.delete(keys[i]);
      }
    }
  } catch {
    // 配额满或不可用时忽略
  }
}

export async function getImageCacheUsage(): Promise<{ count: number; estimatedQuota?: number }> {
  try {
    const cache = await caches.open(CACHE_NAME);
    const keys = await cache.keys();
    const quota = typeof navigator !== "undefined" && navigator.storage?.estimate
      ? await navigator.storage.estimate()
      : undefined;
    return {
      count: keys.length,
      estimatedQuota: quota?.quota ? Math.round(quota.quota / (1024 * 1024)) : undefined,
    };
  } catch {
    return { count: 0 };
  }
}

/** 清空本地图片缓存，释放空间 */
export async function clearImageCache(): Promise<void> {
  try {
    await caches.delete(CACHE_NAME);
  } catch {
    // ignore
  }
}
