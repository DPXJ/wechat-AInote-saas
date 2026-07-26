"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { FileTimelineItem } from "@/lib/types";
import { formatDateOnly, formatDateTime, formatTime } from "@/lib/utils";

const PAGE_SIZE = 80;

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileKind(mimeType: string) {
  if (mimeType.startsWith("image/")) return "图片";
  if (mimeType.startsWith("video/")) return "视频";
  if (mimeType.startsWith("audio/")) return "音频";
  if (mimeType === "application/pdf") return "PDF";
  if (mimeType.includes("sheet") || mimeType.includes("excel")) return "表格";
  if (mimeType.includes("word") || mimeType.includes("document")) return "文档";
  if (mimeType.includes("presentation") || mimeType.includes("powerpoint")) return "演示";
  return "文件";
}

function fileIcon(mimeType: string) {
  if (mimeType.startsWith("image/")) return "IMG";
  if (mimeType.startsWith("video/")) return "VID";
  if (mimeType.startsWith("audio/")) return "AUD";
  if (mimeType === "application/pdf") return "PDF";
  if (mimeType.includes("sheet") || mimeType.includes("excel")) return "XLS";
  if (mimeType.includes("presentation") || mimeType.includes("powerpoint")) return "PPT";
  if (mimeType.includes("word") || mimeType.includes("document")) return "DOC";
  return "FILE";
}

function buildAssetPath(id: string, download = false) {
  const suffix = download ? "?download=1" : "";
  return `/api/assets/${id}${suffix}`;
}

function buildAbsoluteAssetUrl(id: string) {
  if (typeof window === "undefined") return buildAssetPath(id);
  return `${window.location.origin}${buildAssetPath(id)}`;
}

function groupByDate(files: FileTimelineItem[]) {
  const groups: Array<{ date: string; files: FileTimelineItem[] }> = [];
  for (const file of files) {
    const date = formatDateOnly(file.createdAt);
    const last = groups[groups.length - 1];
    if (last?.date === date) {
      last.files.push(file);
    } else {
      groups.push({ date, files: [file] });
    }
  }
  return groups;
}

export function FileTimelinePanel() {
  const [files, setFiles] = useState<FileTimelineItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [selectedFile, setSelectedFile] = useState<FileTimelineItem | null>(null);
  const [shareStatus, setShareStatus] = useState("");

  const groups = useMemo(() => groupByDate(files), [files]);
  const hasMore = files.length < total;

  const loadFiles = useCallback(async (offset = 0) => {
    if (offset === 0) {
      setLoading(true);
      setError("");
    } else {
      setLoadingMore(true);
    }
    try {
      const res = await fetch(`/api/files/timeline?limit=${PAGE_SIZE}&offset=${offset}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "读取文件时间线失败");
      const next = Array.isArray(data.files) ? data.files as FileTimelineItem[] : [];
      setTotal(typeof data.total === "number" ? data.total : next.length);
      setFiles((prev) => (offset === 0 ? next : [...prev, ...next]));
    } catch (e) {
      setError(e instanceof Error ? e.message : "读取文件时间线失败");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    void loadFiles(0);
  }, [loadFiles]);

  const handleShare = async (file: FileTimelineItem) => {
    const url = buildAbsoluteAssetUrl(file.id);
    const text = `${file.originalName}\n${file.description || file.recordSummary || ""}`.trim();
    try {
      if (navigator.share) {
        await navigator.share({ title: file.originalName, text, url });
        setShareStatus("已打开系统分享");
      } else {
        await navigator.clipboard.writeText(url);
        setShareStatus("文件链接已复制");
      }
    } catch {
      // 用户取消系统分享时保持安静。
    }
    setTimeout(() => setShareStatus(""), 2000);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-4 flex shrink-0 flex-col gap-3 border-b border-[var(--line)] pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-[var(--foreground)]">文件时间线</h2>
          <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
            按保存日期归档附件，保留文件名、自动标签、描述和来源信源。
          </p>
        </div>
        <div className="flex items-center gap-2">
          {shareStatus && <span className="text-xs text-[var(--success)]">{shareStatus}</span>}
          <span className="rounded-lg bg-[var(--surface)] px-2.5 py-1.5 text-xs text-[var(--muted-strong)]">
            {total} 个文件
          </span>
          <button
            type="button"
            onClick={() => loadFiles(0)}
            className="rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-xs font-medium text-[var(--muted-strong)] transition hover:bg-[var(--surface-strong)] hover:text-[var(--foreground)]"
          >
            刷新
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-3 rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-500">
          {error}
        </div>
      )}

      <div className="hide-scrollbar min-h-0 flex-1 overflow-y-auto pr-1">
        {loading ? (
          <div className="grid gap-3 md:grid-cols-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-32 animate-pulse rounded-xl border border-[var(--line)] bg-[var(--surface)]" />
            ))}
          </div>
        ) : files.length === 0 ? (
          <div className="flex h-full min-h-[260px] items-center justify-center rounded-xl border border-dashed border-[var(--line)] text-sm text-[var(--muted)]">
            还没有收藏文件。上传附件后会自动出现在这里。
          </div>
        ) : (
          <div className="space-y-7">
            {groups.map((group) => (
              <section key={group.date} className="relative">
                <div className="sticky top-0 z-[1] mb-3 flex items-center gap-3 bg-[var(--card)]/95 py-1 backdrop-blur">
                  <span className="text-xs font-semibold text-[var(--foreground)]">{group.date}</span>
                  <span className="h-px flex-1 bg-[var(--line)]" />
                  <span className="text-[11px] text-[var(--muted)]">{group.files.length} 个</span>
                </div>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {group.files.map((file) => (
                    <article
                      key={file.id}
                      className="group flex min-h-[150px] flex-col rounded-xl border border-[var(--line)] bg-[var(--surface)]/45 p-4 transition hover:border-[var(--line-strong)] hover:bg-[var(--surface)]"
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[var(--line)] bg-[var(--card)] text-[10px] font-bold text-[var(--muted-strong)]">
                          {fileIcon(file.mimeType)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <h3 className="truncate text-sm font-semibold text-[var(--foreground)]" title={file.originalName}>
                            {file.originalName}
                          </h3>
                          <p className="mt-1 truncate text-[11px] text-[var(--muted)]">
                            {formatTime(file.createdAt)} · {fileKind(file.mimeType)} · {formatSize(file.byteSize)}
                          </p>
                        </div>
                      </div>

                      <p className="mt-3 line-clamp-2 min-h-[2.5rem] text-xs leading-5 text-[var(--muted-strong)]">
                        {file.description || file.recordSummary || "暂无描述，点开可查看来源信源和文件详情。"}
                      </p>

                      {file.tags.length > 0 && (
                        <div className="mt-3 flex min-h-6 flex-wrap gap-1.5">
                          {file.tags.slice(0, 4).map((tag) => (
                            <span key={tag} className="rounded-md bg-[var(--card)] px-2 py-0.5 text-[11px] text-[var(--muted-strong)]">
                              #{tag}
                            </span>
                          ))}
                          {file.tags.length > 4 && (
                            <span className="rounded-md bg-[var(--card)] px-2 py-0.5 text-[11px] text-[var(--muted)]">
                              +{file.tags.length - 4}
                            </span>
                          )}
                        </div>
                      )}

                      <div className="mt-auto flex items-center justify-between gap-2 pt-4">
                        <button
                          type="button"
                          onClick={() => setSelectedFile(file)}
                          className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-[var(--muted-strong)] transition hover:bg-[var(--card)] hover:text-[var(--foreground)]"
                        >
                          详情
                        </button>
                        <div className="flex items-center gap-1.5">
                          <a
                            href={buildAssetPath(file.id)}
                            target="_blank"
                            rel="noreferrer"
                            className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-[var(--muted-strong)] transition hover:bg-[var(--card)] hover:text-[var(--foreground)]"
                          >
                            打开
                          </a>
                          <a
                            href={buildAssetPath(file.id, true)}
                            className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-[var(--muted-strong)] transition hover:bg-[var(--card)] hover:text-[var(--foreground)]"
                          >
                            下载
                          </a>
                          <button
                            type="button"
                            onClick={() => handleShare(file)}
                            className="rounded-lg bg-[var(--foreground)] px-2.5 py-1.5 text-xs font-medium text-[var(--background)] transition opacity-90 hover:opacity-100"
                          >
                            分享
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            ))}

            {hasMore && (
              <div className="flex justify-center pt-2">
                <button
                  type="button"
                  disabled={loadingMore}
                  onClick={() => loadFiles(files.length)}
                  className="rounded-xl border border-[var(--line)] px-4 py-2 text-sm text-[var(--muted-strong)] transition hover:bg-[var(--surface)] disabled:opacity-50"
                >
                  {loadingMore ? "加载中..." : "加载更多"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {selectedFile && (
        <div className="fixed inset-0 z-[160] flex items-center justify-center bg-black/55 px-4 py-6 backdrop-blur-sm" role="dialog" aria-modal="true">
          <button className="absolute inset-0" type="button" aria-label="关闭" onClick={() => setSelectedFile(null)} />
          <div className="relative flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--card)] shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-[var(--line)] px-5 py-4">
              <div className="min-w-0">
                <p className="text-xs text-[var(--muted)]">{fileKind(selectedFile.mimeType)} · {formatSize(selectedFile.byteSize)}</p>
                <h3 className="mt-1 truncate text-base font-semibold text-[var(--foreground)]">{selectedFile.originalName}</h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedFile(null)}
                className="rounded-lg px-2 py-1 text-sm text-[var(--muted)] transition hover:bg-[var(--surface)] hover:text-[var(--foreground)]"
              >
                关闭
              </button>
            </div>
            <div className="hide-scrollbar overflow-y-auto px-5 py-4">
              <dl className="grid gap-4 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-[var(--muted)]">保存时间</dt>
                  <dd className="mt-1 text-[var(--foreground)]">{formatDateTime(selectedFile.createdAt)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-[var(--muted)]">来源信源</dt>
                  <dd className="mt-1 truncate text-[var(--foreground)]">{selectedFile.recordTitle}</dd>
                </div>
                <div>
                  <dt className="text-xs text-[var(--muted)]">来源标签</dt>
                  <dd className="mt-1 text-[var(--foreground)]">{selectedFile.recordSourceLabel || "手动收件箱"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-[var(--muted)]">记录时间</dt>
                  <dd className="mt-1 text-[var(--foreground)]">{formatDateOnly(selectedFile.recordCreatedAt)}</dd>
                </div>
              </dl>

              <div className="mt-5">
                <p className="text-xs text-[var(--muted)]">描述</p>
                <p className="mt-2 whitespace-pre-wrap rounded-xl bg-[var(--surface)] px-4 py-3 text-sm leading-6 text-[var(--muted-strong)]">
                  {selectedFile.description || selectedFile.recordSummary || "暂无描述"}
                </p>
              </div>

              {selectedFile.tags.length > 0 && (
                <div className="mt-5">
                  <p className="text-xs text-[var(--muted)]">自动标签</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {selectedFile.tags.map((tag) => (
                      <span key={tag} className="rounded-lg bg-[var(--surface)] px-2.5 py-1 text-xs text-[var(--muted-strong)]">#{tag}</span>
                    ))}
                  </div>
                </div>
              )}

              {selectedFile.ocrText && (
                <div className="mt-5">
                  <p className="text-xs text-[var(--muted)]">OCR / 识别内容</p>
                  <p className="mt-2 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-xl bg-[var(--surface)] px-4 py-3 text-xs leading-5 text-[var(--muted-strong)]">
                    {selectedFile.ocrText}
                  </p>
                </div>
              )}
            </div>
            <div className="flex flex-wrap justify-end gap-2 border-t border-[var(--line)] px-5 py-4">
              <a href={`/?tab=history&record=${selectedFile.recordId}`} className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm text-[var(--muted-strong)] transition hover:bg-[var(--surface)] hover:text-[var(--foreground)]">
                查看信源
              </a>
              <a href={buildAssetPath(selectedFile.id, true)} className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm text-[var(--muted-strong)] transition hover:bg-[var(--surface)] hover:text-[var(--foreground)]">
                下载文件
              </a>
              <button
                type="button"
                onClick={() => handleShare(selectedFile)}
                className="rounded-lg bg-[var(--foreground)] px-3 py-2 text-sm font-medium text-[var(--background)]"
              >
                分享
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
