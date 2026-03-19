"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useCachedImage } from "@/hooks/use-cached-image";
import type { RecordAsset } from "@/lib/types";

function isImage(mime: string) {
  return mime.startsWith("image/");
}
function isVideo(mime: string) {
  return mime.startsWith("video/");
}
function isAudio(mime: string) {
  return mime.startsWith("audio/");
}
function isPdf(mime: string) {
  return mime === "application/pdf";
}

function assetUrl(id: string) {
  return `/api/assets/${id}`;
}
function thumbUrl(id: string) {
  return `/api/assets/${id}?thumb=1`;
}
function downloadUrl(id: string) {
  return `/api/assets/${id}?download=1`;
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function ImageSkeleton() {
  return (
    <div className="absolute inset-0 flex flex-col justify-center gap-2 px-4 py-6" aria-hidden>
      <div className="h-3 w-full max-w-[85%] overflow-hidden rounded-md bg-[var(--line)]">
        <div className="image-skeleton-shine h-full w-1/2 rounded-md bg-[var(--line-strong)]" />
      </div>
      <div className="h-3 w-full max-w-[70%] overflow-hidden rounded-md bg-[var(--line)]">
        <div className="image-skeleton-shine h-full w-1/2 rounded-md bg-[var(--line-strong)]" />
      </div>
      <div className="h-3 w-full max-w-[90%] overflow-hidden rounded-md bg-[var(--line)]">
        <div className="image-skeleton-shine h-full w-1/2 rounded-md bg-[var(--line-strong)]" />
      </div>
      <div className="mt-2 h-2 w-1/2 max-w-[40%] overflow-hidden rounded bg-[var(--line)]">
        <div className="image-skeleton-shine h-full w-1/2 rounded bg-[var(--line-strong)]" />
      </div>
    </div>
  );
}

function DownloadBtn({ assetId, size = "sm" }: { assetId: string; size?: "sm" | "md" }) {
  const cls =
    size === "md"
      ? "inline-flex items-center gap-1.5 rounded-lg bg-[var(--surface)] px-3 py-1.5 text-sm text-[var(--muted-strong)] transition hover:bg-[var(--surface-strong)] hover:text-[var(--foreground)]"
      : "inline-flex items-center gap-1 rounded-md bg-[var(--surface)] px-2 py-1 text-xs text-[var(--muted-strong)] transition hover:bg-[var(--surface-strong)] hover:text-[var(--foreground)]";

  return (
    <a href={downloadUrl(assetId)} className={cls}>
      <span>↓</span>
      <span>下载</span>
    </a>
  );
}

function FileIcon({ mime }: { mime: string }) {
  if (isPdf(mime)) return <span className="text-lg">📄</span>;
  if (mime.includes("word") || mime.includes("document"))
    return <span className="text-lg">📝</span>;
  if (mime.includes("sheet") || mime.includes("excel"))
    return <span className="text-lg">📊</span>;
  if (mime.includes("presentation") || mime.includes("powerpoint"))
    return <span className="text-lg">📽️</span>;
  return <span className="text-lg">📎</span>;
}

const LIGHTBOX_MIN_ZOOM = 0.5;
const LIGHTBOX_MAX_ZOOM = 4;
const LIGHTBOX_ZOOM_STEP = 0.25;

function Lightbox({
  asset,
  assets,
  onClose,
  onNavigate,
}: {
  asset: RecordAsset;
  assets: RecordAsset[];
  onClose: () => void;
  onNavigate: (id: string) => void;
}) {
  const [zoom, setZoom] = useState(1);
  const [fullImgError, setFullImgError] = useState(false);
  const fullImageUrl = assetUrl(asset.id);
  const { src: fullSrc, isLoading: fullLoading, error: fullError } = useCachedImage(fullImageUrl);
  const lightboxImgSrc = (fullSrc && !fullError) ? fullSrc : (fullError ? fullImageUrl : null);
  const showFullImg = lightboxImgSrc && !fullImgError;
  const imageAssets = assets.filter((a) => isImage(a.mimeType));

  useEffect(() => {
    setFullImgError(false);
  }, [asset.id]);
  const currentIdx = imageAssets.findIndex((a) => a.id === asset.id);
  const hasPrev = currentIdx > 0;
  const hasNext = currentIdx < imageAssets.length - 1;

  // 切换图片时重置缩放
  useEffect(() => {
    setZoom(1);
  }, [asset.id]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && hasPrev)
        onNavigate(imageAssets[currentIdx - 1].id);
      if (e.key === "ArrowRight" && hasNext)
        onNavigate(imageAssets[currentIdx + 1].id);
    },
    [onClose, onNavigate, imageAssets, currentIdx, hasPrev, hasNext],
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [handleKeyDown]);

  const zoomIn = (e: React.MouseEvent) => {
    e.stopPropagation();
    setZoom((z) => Math.min(LIGHTBOX_MAX_ZOOM, z + LIGHTBOX_ZOOM_STEP));
  };
  const zoomOut = (e: React.MouseEvent) => {
    e.stopPropagation();
    setZoom((z) => Math.max(LIGHTBOX_MIN_ZOOM, z - LIGHTBOX_ZOOM_STEP));
  };
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const delta = e.deltaY > 0 ? -LIGHTBOX_ZOOM_STEP : LIGHTBOX_ZOOM_STEP;
      setZoom((z) =>
        Math.max(LIGHTBOX_MIN_ZOOM, Math.min(LIGHTBOX_MAX_ZOOM, z + delta)),
      );
    },
    [],
  );

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      {/* Top bar */}
      <div className="absolute top-0 right-0 left-0 z-10 flex items-center justify-between px-4 py-3">
        <span className="rounded-lg bg-black/50 px-3 py-1.5 text-sm text-white/80">
          {asset.originalName}
          {imageAssets.length > 1 && (
            <span className="ml-2 text-white/50">
              {currentIdx + 1} / {imageAssets.length}
            </span>
          )}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={zoomOut}
            className="rounded-lg bg-black/50 px-3 py-1.5 text-sm text-white/80 transition hover:bg-black/70 hover:text-white"
            title="缩小"
          >
            −
          </button>
          <span className="min-w-[3rem] rounded-lg bg-black/50 px-2 py-1.5 text-center text-sm text-white/80">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={zoomIn}
            className="rounded-lg bg-black/50 px-3 py-1.5 text-sm text-white/80 transition hover:bg-black/70 hover:text-white"
            title="放大"
          >
            +
          </button>
          <a
            href={downloadUrl(asset.id)}
            onClick={(e) => e.stopPropagation()}
            className="rounded-lg bg-black/50 px-3 py-1.5 text-sm text-white/80 transition hover:bg-black/70 hover:text-white"
          >
            ↓ 下载
          </a>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-black/50 px-3 py-1.5 text-sm text-white/80 transition hover:bg-black/70 hover:text-white"
          >
            ✕ 关闭
          </button>
        </div>
      </div>

      {/* Nav arrows */}
      {hasPrev && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onNavigate(imageAssets[currentIdx - 1].id);
          }}
          className="absolute left-3 z-10 rounded-full bg-black/50 p-3 text-2xl text-white/80 transition hover:bg-black/70 hover:text-white"
        >
          ‹
        </button>
      )}
      {hasNext && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onNavigate(imageAssets[currentIdx + 1].id);
          }}
          className="absolute right-3 z-10 rounded-full bg-black/50 p-3 text-2xl text-white/80 transition hover:bg-black/70 hover:text-white"
        >
          ›
        </button>
      )}

      {/* 图片区域：优先缓存原图，命中则秒出；未命中时显示骨架直到加载完成 */}
      <div
        className="flex min-h-0 w-full flex-1 items-center justify-center overflow-auto p-4 pt-16 pb-8"
        onClick={(e) => e.stopPropagation()}
        onWheel={handleWheel}
        style={{ maxHeight: "100vh" }}
      >
        <div
          className="flex shrink-0 items-center justify-center transition-transform duration-150"
          style={{ transform: `scale(${zoom})`, transformOrigin: "center center" }}
        >
          {fullLoading && !fullError && (
            <div className="flex h-64 w-96 items-center justify-center rounded-xl bg-[var(--surface)]">
              <ImageSkeleton />
            </div>
          )}
          {showFullImg && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={lightboxImgSrc}
              alt={asset.originalName}
              onError={() => setFullImgError(true)}
              className="rounded-xl object-contain shadow-2xl"
              style={{
                maxHeight: "calc(100vh - 8rem)",
                maxWidth: "calc(100vw - 4rem)",
                width: "auto",
                height: "auto",
              }}
              draggable={false}
            />
          )}
          {!fullLoading && !showFullImg && (
            <div className="flex flex-col items-center justify-center gap-3 rounded-xl bg-[var(--surface)] px-8 py-12">
              <span className="text-4xl text-[var(--muted)]">🖼️</span>
              <span className="text-sm text-[var(--muted)]">图片加载失败</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CopyBtn({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    if (!text.trim()) return;
    try {
      await navigator.clipboard.writeText(text.trim());
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {}
  };
  return (
    <button
      type="button"
      onClick={handleCopy}
      title={label || "复制"}
      className="shrink-0 rounded p-1.5 text-[var(--muted)] transition hover:bg-[var(--surface-strong)] hover:text-[var(--foreground)]"
    >
      {copied ? (
        <span className="text-[10px] text-emerald-500">已复制</span>
      ) : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      )}
    </button>
  );
}

/** 兼容接口返回 snake_case 的情况 */
function getOcrText(asset: RecordAsset): string {
  const a = asset as RecordAsset & { ocr_text?: string };
  return (asset.ocrText ?? a.ocr_text ?? "").trim();
}

function ImageCard({
  asset,
  onLightbox,
  useThumb,
}: {
  asset: RecordAsset;
  onLightbox: (id: string) => void;
  useThumb?: boolean;
}) {
  const [imgLoadError, setImgLoadError] = useState(false);
  const imageUrl = useThumb ? thumbUrl(asset.id) : assetUrl(asset.id);
  const { src, isLoading, error } = useCachedImage(imageUrl);
  const ocrText = getOcrText(asset);
  const desc = (asset.description ?? "").trim();
  const hasDescOrOcr = Boolean(desc || ocrText);
  const copyText = [desc, ocrText].filter(Boolean).join("\n\n");
  const showSkeleton = isLoading && !error;
  const imgSrc = (src && !error) ? src : (error ? imageUrl : null);
  const showImg = imgSrc && !imgLoadError;

  return (
    <div className="group relative flex overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--card)]">
      {/* 左侧：缓存命中或原生加载；失败时回退到原 URL；img onError 时显示占位 */}
      <button
        type="button"
        onClick={() => onLightbox(asset.id)}
        className="shrink-0 cursor-zoom-in p-2.5"
      >
        <div className="relative h-56 w-40 overflow-hidden rounded-xl bg-[var(--surface)] sm:h-64 sm:w-44">
          {showSkeleton && <ImageSkeleton />}
          {showImg && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={imgSrc}
              alt={asset.originalName}
              loading="lazy"
              onError={() => setImgLoadError(true)}
              className="h-full w-full object-contain transition duration-300 opacity-100"
            />
          )}
          {!showSkeleton && !showImg && (
            <div className="flex h-full w-full flex-col items-center justify-center gap-1 px-3 py-4 text-center">
              <span className="text-[24px] text-[var(--muted)]">🖼️</span>
              <span className="text-xs text-[var(--muted)]">图片加载失败</span>
            </div>
          )}
        </div>
      </button>
      {/* 右侧：文件名 + 描述/OCR + 复制 */}
      <div className="flex min-w-0 flex-1 flex-col py-2.5 pr-3 pl-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="min-w-0 truncate text-[13px] text-[var(--muted-strong)]">
              {asset.originalName}
            </span>
            {ocrText ? (
              <span className="shrink-0 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600">OCR</span>
            ) : (
              <span className="shrink-0 rounded bg-[var(--surface)] px-1.5 py-0.5 text-[10px] text-[var(--muted)]">OCR</span>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="text-xs text-[var(--muted)]">{formatSize(asset.byteSize)}</span>
            <DownloadBtn assetId={asset.id} />
          </div>
        </div>
        {hasDescOrOcr ? (
          <div className="mt-2 flex min-h-0 flex-1 flex-col rounded-lg bg-[var(--surface)] px-2.5 py-2 text-[11px] leading-5">
            <div className="flex shrink-0 items-start justify-between gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">图片描述 / OCR</span>
              <CopyBtn text={copyText} label="复制描述与 OCR 文字" />
            </div>
            <div className="mt-1 min-h-0 flex-1 overflow-y-auto space-y-1.5 pr-1">
              {desc && <p className="text-[var(--muted-strong)]">{desc}</p>}
              {ocrText && <p className="text-[var(--muted-strong)] whitespace-pre-wrap">{ocrText}</p>}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function VideoCard({ asset }: { asset: RecordAsset }) {
  return (
    <div className="overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--card)]">
      <video
        src={assetUrl(asset.id)}
        controls
        preload="metadata"
        className="w-full bg-black"
      />
      <div className="flex items-center justify-between gap-2 px-3 py-2.5">
        <span className="min-w-0 truncate text-[13px] text-[var(--muted-strong)]">
          {asset.originalName}
        </span>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-xs text-[var(--muted)]">
            {formatSize(asset.byteSize)}
          </span>
          <DownloadBtn assetId={asset.id} />
        </div>
      </div>
    </div>
  );
}

function AudioCard({ asset }: { asset: RecordAsset }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-[var(--line)] bg-[var(--card)] px-4 py-3">
      <span className="text-lg">🎵</span>
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="min-w-0 truncate text-sm text-[var(--foreground)]">
            {asset.originalName}
          </span>
          <div className="flex shrink-0 items-center gap-2">
            <span className="text-xs text-[var(--muted)]">
              {formatSize(asset.byteSize)}
            </span>
            <DownloadBtn assetId={asset.id} />
          </div>
        </div>
        <audio
          src={assetUrl(asset.id)}
          controls
          preload="metadata"
          className="h-8 w-full"
        />
      </div>
    </div>
  );
}

function PdfCard({ asset }: { asset: RecordAsset }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--card)]">
      <div className="flex items-center justify-between gap-2 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-lg">📄</span>
          <span className="min-w-0 truncate text-sm text-[var(--foreground)]">
            {asset.originalName}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-xs text-[var(--muted)]">
            {formatSize(asset.byteSize)}
          </span>
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="rounded-md bg-[var(--surface)] px-2 py-1 text-xs text-[var(--muted-strong)] transition hover:bg-[var(--surface-strong)] hover:text-[var(--foreground)]"
          >
            {expanded ? "收起" : "预览"}
          </button>
          <a
            href={assetUrl(asset.id)}
            target="_blank"
            rel="noreferrer"
            className="rounded-md bg-[var(--surface)] px-2 py-1 text-xs text-[var(--muted-strong)] transition hover:bg-[var(--surface-strong)] hover:text-[var(--foreground)]"
          >
            新窗口
          </a>
          <DownloadBtn assetId={asset.id} />
        </div>
      </div>
      {expanded && (
        <div className="border-t border-[var(--line)]">
          <iframe
            src={assetUrl(asset.id)}
            title={asset.originalName}
            className="h-[500px] w-full"
          />
        </div>
      )}
    </div>
  );
}

function GenericCard({ asset }: { asset: RecordAsset }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--line)] bg-[var(--card)] px-4 py-3 transition hover:border-[var(--line-strong)]">
      <div className="flex min-w-0 items-center gap-2">
        <FileIcon mime={asset.mimeType} />
        <div className="min-w-0">
          <p className="truncate text-sm text-[var(--foreground)]">
            {asset.originalName}
          </p>
          <p className="text-xs text-[var(--muted)]">
            {asset.mimeType} · {formatSize(asset.byteSize)}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <a
          href={assetUrl(asset.id)}
          target="_blank"
          rel="noreferrer"
          className="rounded-md bg-[var(--surface)] px-2 py-1 text-xs text-[var(--muted-strong)] transition hover:bg-[var(--surface-strong)] hover:text-[var(--foreground)]"
        >
          打开
        </a>
        <DownloadBtn assetId={asset.id} />
      </div>
    </div>
  );
}

export function AssetGallery({ assets, useThumbnails }: { assets: RecordAsset[]; useThumbnails?: boolean }) {
  const [lightboxId, setLightboxId] = useState<string | null>(null);

  if (assets.length === 0) return null;

  const images = assets.filter((a) => isImage(a.mimeType));
  const videos = assets.filter((a) => isVideo(a.mimeType));
  const audios = assets.filter((a) => isAudio(a.mimeType));
  const pdfs = assets.filter((a) => isPdf(a.mimeType));
  const others = assets.filter(
    (a) =>
      !isImage(a.mimeType) &&
      !isVideo(a.mimeType) &&
      !isAudio(a.mimeType) &&
      !isPdf(a.mimeType),
  );

  const lightboxAsset = lightboxId
    ? images.find((a) => a.id === lightboxId)
    : null;

  return (
    <section className="mt-4 space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
        附件 ({assets.length})
      </p>

      {/* Image grid：每行一张图，左图右描述 */}
      {images.length > 0 && (
        <div className="grid grid-cols-1 gap-3">
          {images.map((asset) => (
            <ImageCard
              key={asset.id}
              asset={asset}
              onLightbox={setLightboxId}
              useThumb={useThumbnails}
            />
          ))}
        </div>
      )}

      {/* Videos */}
      {videos.length > 0 && (
        <div className="grid gap-3 lg:grid-cols-2">
          {videos.map((asset) => (
            <VideoCard key={asset.id} asset={asset} />
          ))}
        </div>
      )}

      {/* Audios */}
      {audios.length > 0 && (
        <div className="space-y-2">
          {audios.map((asset) => (
            <AudioCard key={asset.id} asset={asset} />
          ))}
        </div>
      )}

      {/* PDFs */}
      {pdfs.length > 0 && (
        <div className="space-y-2">
          {pdfs.map((asset) => (
            <PdfCard key={asset.id} asset={asset} />
          ))}
        </div>
      )}

      {/* Others */}
      {others.length > 0 && (
        <div className="space-y-2">
          {others.map((asset) => (
            <GenericCard key={asset.id} asset={asset} />
          ))}
        </div>
      )}

      {/* Lightbox：挂到 body 实现真正全屏，不受预览区宽度限制 */}
      {lightboxAsset &&
        createPortal(
          <Lightbox
            asset={lightboxAsset}
            assets={assets}
            onClose={() => setLightboxId(null)}
            onNavigate={setLightboxId}
          />,
          document.body,
        )}
    </section>
  );
}
