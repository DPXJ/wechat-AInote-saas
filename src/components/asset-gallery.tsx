"use client";

import { useCallback, useEffect, useState } from "react";
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
  const imageAssets = assets.filter((a) => isImage(a.mimeType));
  const currentIdx = imageAssets.findIndex((a) => a.id === asset.id);
  const hasPrev = currentIdx > 0;
  const hasNext = currentIdx < imageAssets.length - 1;

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

      {/* Image */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={assetUrl(asset.id)}
        alt={asset.originalName}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain shadow-2xl"
      />
    </div>
  );
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
  const [loaded, setLoaded] = useState(false);

  return (
    <div className="group relative overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--card)]">
      <button
        type="button"
        onClick={() => onLightbox(asset.id)}
        className="block w-full cursor-zoom-in"
      >
        <div className="relative aspect-video w-full bg-[var(--surface)]">
          {!loaded && (
            <div className="absolute inset-0 flex items-center justify-center text-xs text-[var(--muted)]">
              加载中...
            </div>
          )}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={useThumb ? thumbUrl(asset.id) : assetUrl(asset.id)}
            alt={asset.originalName}
            loading="lazy"
            onLoad={() => setLoaded(true)}
            className={[
              "h-full w-full object-cover transition duration-300",
              loaded ? "opacity-100" : "opacity-0",
            ].join(" ")}
          />
        </div>
      </button>
      <div className="flex items-center justify-between gap-2 px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="min-w-0 truncate text-[13px] text-[var(--muted-strong)]">
            {asset.originalName}
          </span>
          {asset.ocrText ? (
            <span className="shrink-0 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600">OCR</span>
          ) : (
            <span className="shrink-0 rounded bg-[var(--surface)] px-1.5 py-0.5 text-[10px] text-[var(--muted)]">OCR</span>
          )}
        </div>
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

      {/* Image grid */}
      {images.length > 0 && (
        <div
          className={[
            "grid gap-3",
            images.length === 1
              ? "grid-cols-1 max-w-md"
              : images.length === 2
                ? "grid-cols-2"
                : "grid-cols-2 lg:grid-cols-3",
          ].join(" ")}
        >
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

      {/* Lightbox overlay */}
      {lightboxAsset && (
        <Lightbox
          asset={lightboxAsset}
          assets={assets}
          onClose={() => setLightboxId(null)}
          onNavigate={setLightboxId}
        />
      )}
    </section>
  );
}
