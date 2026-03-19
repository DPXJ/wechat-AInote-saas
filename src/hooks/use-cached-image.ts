"use client";

import { useEffect, useRef, useState } from "react";
import { getCachedImage, setCachedImage } from "@/lib/image-cache";

/**
 * 优先从本地缓存取图，未命中再请求并写入缓存。
 * 用于附件缩略图/原图：首次显示骨架直到加载完成，之后同会话或二次进入从缓存秒出图。
 */
export function useCachedImage(url: string | null): {
  src: string | null;
  isLoading: boolean;
  error: boolean;
} {
  const [src, setSrc] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(!!url);
  const [error, setError] = useState(false);
  const blobUrlRef = useRef<string | null>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    if (!url) {
      setSrc(null);
      setIsLoading(false);
      setError(false);
      blobUrlRef.current = null;
      return;
    }

    cancelledRef.current = false;
    setIsLoading(true);
    setError(false);

    (async () => {
      try {
        const blob = await getCachedImage(url);
        if (cancelledRef.current) return;
        if (blob) {
          const objectUrl = URL.createObjectURL(blob);
          blobUrlRef.current = objectUrl;
          setSrc(objectUrl);
          setIsLoading(false);
          return;
        }

        const res = await fetch(url, { credentials: "include" });
        if (cancelledRef.current) return;
        if (!res.ok) {
          setError(true);
          setIsLoading(false);
          return;
        }
        const fetchedBlob = await res.blob();
        if (cancelledRef.current) return;
        await setCachedImage(url, fetchedBlob, res.headers.get("Content-Type") || undefined);
        if (cancelledRef.current) return;
        const objectUrl = URL.createObjectURL(fetchedBlob);
        blobUrlRef.current = objectUrl;
        setSrc(objectUrl);
        setIsLoading(false);
      } catch {
        if (!cancelledRef.current) {
          setError(true);
          setIsLoading(false);
        }
      }
    })();

    return () => {
      cancelledRef.current = true;
      const prev = blobUrlRef.current;
      blobUrlRef.current = null;
      if (prev) URL.revokeObjectURL(prev);
    };
  }, [url]);

  return { src, isLoading, error };
}
