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

function fileBadge(mimeType: string) {
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

function buildAssetPreviewPath(id: string, thumb = false) {
  return `/api/assets/${id}${thumb ? "?thumb=1" : ""}`;
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

function compactText(text: string, max = 180) {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max)}...`;
}

function fileMatchesQuery(file: FileTimelineItem, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [
    file.originalName,
    file.description,
    file.ocrText,
    file.recordTitle,
    file.recordSummary,
    file.recordSourceLabel,
    file.recordContentText,
    file.recordExtractedText,
    ...file.tags,
    ...file.recordKeywords,
    ...file.recordActionItems,
  ]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(q));
}

function StarIcon({ filled = false }: { filled?: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
      <path
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M11.48 3.5a.56.56 0 0 1 1.04 0l2.13 5.11c.08.2.26.33.47.35l5.52.44c.5.04.7.66.32.99l-4.2 3.6a.56.56 0 0 0-.19.56l1.29 5.38a.56.56 0 0 1-.84.61l-4.73-2.89a.56.56 0 0 0-.58 0l-4.73 2.89a.56.56 0 0 1-.84-.61l1.29-5.39a.56.56 0 0 0-.18-.55l-4.21-3.6a.56.56 0 0 1 .32-.99l5.52-.44c.21-.02.39-.15.48-.35l2.12-5.11Z"
      />
    </svg>
  );
}

function PreviewPane({ file }: { file: FileTimelineItem }) {
  const src = buildAssetPreviewPath(file.id);
  if (file.mimeType.startsWith("image/")) {
    return <ImagePreview file={file} />;
  }
  if (file.mimeType === "application/pdf") {
    return (
      <iframe
        src={src}
        title={file.originalName}
        className="h-[52vh] min-h-[360px] w-full rounded-xl border border-[var(--line)] bg-[var(--surface)]"
      />
    );
  }
  if (file.mimeType.startsWith("video/")) {
    return (
      <video src={src} controls className="max-h-[52vh] w-full rounded-xl border border-[var(--line)] bg-black" />
    );
  }
  if (file.mimeType.startsWith("audio/")) {
    return (
      <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
        <audio src={src} controls className="w-full" />
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-dashed border-[var(--line)] bg-[var(--surface)] px-5 py-8 text-center">
      <p className="text-sm font-medium text-[var(--foreground)]">此文件类型无法在浏览器内直接预览</p>
      <p className="mt-1 text-xs text-[var(--muted)]">可以下载后打开，AI 摘要和抽取内容在下方查看。</p>
    </div>
  );
}

function ImagePreview({ file }: { file: FileTimelineItem }) {
  const [src, setSrc] = useState(buildAssetPreviewPath(file.id, true));
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setSrc(buildAssetPreviewPath(file.id, true));
    setFailed(false);
  }, [file.id]);

  return (
    <div className="flex min-h-[260px] items-center justify-center overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface)]">
      {failed ? (
        <div className="px-6 py-10 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-[var(--line)] bg-[var(--card)] text-xs font-semibold text-[var(--muted-strong)]">
            IMG
          </div>
          <p className="mt-3 text-sm font-medium text-[var(--foreground)]">图片预览失败</p>
          <p className="mt-1 max-w-sm text-xs leading-5 text-[var(--muted)]">
            可能是原始附件缺失、OSS 临时地址失效或格式暂不支持。可以用“新窗口打开”或“下载”查看。
          </p>
        </div>
      ) : (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={src}
          alt={file.originalName}
          className="max-h-[48vh] w-full object-contain"
          onError={() => {
            if (src.includes("thumb=1")) {
              setSrc(buildAssetPreviewPath(file.id));
              return;
            }
            setFailed(true);
          }}
        />
      )}
    </div>
  );
}

function TimelineThumb({ file }: { file: FileTimelineItem }) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [file.id]);

  if (file.mimeType.startsWith("image/") && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={buildAssetPreviewPath(file.id, true)}
        alt={file.originalName}
        className="h-full w-full object-cover transition duration-200 group-hover:scale-105"
        loading="lazy"
        onError={() => setFailed(true)}
      />
    );
  }

  return <span>{fileBadge(file.mimeType)}</span>;
}

function DetailBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-[var(--line)] bg-[var(--surface)]/55 p-4">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">{title}</h4>
      <div className="mt-2 text-sm leading-6 text-[var(--muted-strong)]">{children}</div>
    </section>
  );
}

export function FileTimelinePanel() {
  const [files, setFiles] = useState<FileTimelineItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [selectedFile, setSelectedFile] = useState<FileTimelineItem | null>(null);
  const [shareStatus, setShareStatus] = useState("");
  const [query, setQuery] = useState("");
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(() => new Set());
  const [favoriteBusyId, setFavoriteBusyId] = useState("");

  const filteredFiles = useMemo(() => files.filter((file) => fileMatchesQuery(file, query)), [files, query]);
  const groups = useMemo(() => groupByDate(filteredFiles), [filteredFiles]);
  const hasMore = files.length < total;

  const loadFavorites = useCallback(async () => {
    try {
      const res = await fetch("/api/favorites", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) return;
      const ids = new Set<string>(
        Array.isArray(data.records) ? data.records.map((record: { id: string }) => record.id) : [],
      );
      setFavoriteIds(ids);
    } catch {
      // 收藏状态不影响主时间线。
    }
  }, []);

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
    void loadFavorites();
  }, [loadFiles, loadFavorites]);

  const toggleFavorite = async (file: FileTimelineItem) => {
    const isFavorite = favoriteIds.has(file.recordId);
    setFavoriteBusyId(file.recordId);
    try {
      const res = await fetch(isFavorite ? `/api/favorites/${file.recordId}` : "/api/favorites", {
        method: isFavorite ? "DELETE" : "POST",
        headers: isFavorite ? undefined : { "Content-Type": "application/json" },
        body: isFavorite ? undefined : JSON.stringify({ recordId: file.recordId }),
      });
      if (!res.ok) throw new Error("favorite failed");
      setFavoriteIds((prev) => {
        const next = new Set(prev);
        if (isFavorite) next.delete(file.recordId);
        else next.add(file.recordId);
        return next;
      });
      setShareStatus(isFavorite ? "已取消收藏" : "已加入收藏");
    } catch {
      setShareStatus("收藏操作失败");
    } finally {
      setFavoriteBusyId("");
      setTimeout(() => setShareStatus(""), 1800);
    }
  };

  const handleShare = async (file: FileTimelineItem) => {
    const url = buildAbsoluteAssetUrl(file.id);
    const text = [file.originalName, file.description || file.recordSummary].filter(Boolean).join("\\n");
    try {
      if (navigator.share) {
        await navigator.share({ title: file.originalName, text, url });
        setShareStatus("已打开系统分享");
      } else {
        await navigator.clipboard.writeText(url);
        setShareStatus("文件链接已复制");
      }
    } catch {
      return;
    }
    setTimeout(() => setShareStatus(""), 2000);
  };

  const selectedAnalysisText = selectedFile
    ? selectedFile.recordExtractedText || selectedFile.ocrText || selectedFile.recordContentText
    : "";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-4 flex shrink-0 flex-col gap-3 border-b border-[var(--line)] pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-[var(--foreground)]">时间线</h2>
          <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
            每一天保存过哪些资料，一眼看清；点开后可预览文件、查看 AI 摘要和 OCR / 文档抽取内容。
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label className="flex min-w-0 items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--muted-strong)] transition focus-within:border-[var(--line-strong)] sm:w-72">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="shrink-0">
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4.3-4.3" />
            </svg>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索文件、标签、OCR、摘要"
              className="min-w-0 flex-1 bg-transparent text-sm text-[var(--foreground)] outline-none placeholder:text-[var(--muted)]"
            />
            {query && (
              <button type="button" onClick={() => setQuery("")} className="rounded-md px-1 text-xs text-[var(--muted)] hover:bg-[var(--card)] hover:text-[var(--foreground)]" aria-label="清空搜索">
                ×
              </button>
            )}
          </label>
          {shareStatus && <span className="text-xs text-[var(--success)]">{shareStatus}</span>}
          <span className="rounded-lg bg-[var(--surface)] px-2.5 py-1.5 text-xs text-[var(--muted-strong)]">
            {query ? `${filteredFiles.length} / ${total} 个文件` : `${total} 个文件`}
          </span>
          <button
            type="button"
            onClick={() => { void loadFiles(0); void loadFavorites(); }}
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
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-40 animate-pulse rounded-xl border border-[var(--line)] bg-[var(--surface)]" />
            ))}
          </div>
        ) : files.length === 0 ? (
          <div className="flex h-full min-h-[260px] items-center justify-center rounded-xl border border-dashed border-[var(--line)] text-center text-sm text-[var(--muted)]">
            还没有资料。去“录入”里粘贴微信/飞书内容，或拖入文件后保存。
          </div>
        ) : filteredFiles.length === 0 ? (
          <div className="flex h-full min-h-[260px] items-center justify-center rounded-xl border border-dashed border-[var(--line)] text-center text-sm text-[var(--muted)]">
            没有匹配的资料。换个关键词试试文件名、标签、来源或 OCR 内容。
          </div>
        ) : (
          <div className="space-y-8">
            {groups.map((group) => (
              <section key={group.date} className="relative grid gap-3 lg:grid-cols-[8rem_1fr]">
                <div className="sticky top-0 z-[1] h-fit bg-[var(--card)]/95 py-1 backdrop-blur">
                  <p className="text-sm font-semibold text-[var(--foreground)]">{group.date}</p>
                  <p className="mt-1 text-xs text-[var(--muted)]">{group.files.length} 个资料</p>
                </div>
                <div className="space-y-3 border-l border-[var(--line)] pl-4">
                  {group.files.map((file) => {
                    const favorite = favoriteIds.has(file.recordId);
                    const summary = file.description || file.recordSummary || file.ocrText || file.recordExtractedText;
                    return (
                      <article
                        key={file.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedFile(file)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            setSelectedFile(file);
                          }
                        }}
                        className="group relative cursor-pointer rounded-xl border border-[var(--line)] bg-[var(--surface)]/45 p-4 transition duration-200 hover:-translate-y-0.5 hover:border-[var(--line-strong)] hover:bg-[var(--surface)] hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40 active:translate-y-0 active:scale-[0.995]"
                      >
                        <span className="absolute -left-[21px] top-6 h-2.5 w-2.5 rounded-full border border-[var(--card)] bg-[var(--foreground)]" />
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                          <button
                            type="button"
                            onClick={(event) => { event.stopPropagation(); setSelectedFile(file); }}
                            className="flex h-12 w-12 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--card)] text-[10px] font-bold text-[var(--muted-strong)] transition group-hover:border-[var(--line-strong)] group-hover:text-[var(--foreground)]"
                            title="查看详情"
                          >
                            <TimelineThumb file={file} />
                          </button>
                          <div className="min-w-0 flex-1">
                            <div className="flex min-w-0 flex-wrap items-center gap-2">
                              <button
                                type="button"
                                onClick={(event) => { event.stopPropagation(); setSelectedFile(file); }}
                                className="min-w-0 flex-1 truncate text-left text-sm font-semibold text-[var(--foreground)] hover:underline"
                                title={file.originalName}
                              >
                                {file.originalName}
                              </button>
                              <span className="rounded-md bg-[var(--card)] px-2 py-0.5 text-[11px] text-[var(--muted-strong)]">
                                {formatTime(file.createdAt)}
                              </span>
                            </div>
                            <p className="mt-1 truncate text-[11px] text-[var(--muted)]">
                              {fileKind(file.mimeType)} · {formatSize(file.byteSize)} · {file.recordSourceLabel || "手动收件箱"}
                            </p>
                            <p className="mt-2 line-clamp-2 text-xs leading-5 text-[var(--muted-strong)]">
                              {summary ? compactText(summary, 150) : "暂无解析内容，点开可查看来源信源和文件详情。"}
                            </p>
                            <div className="mt-3 flex flex-wrap gap-1.5">
                              {[...file.tags, ...file.recordKeywords].slice(0, 5).map((tag) => (
                                <span key={tag} className="rounded-md bg-[var(--card)] px-2 py-0.5 text-[11px] text-[var(--muted-strong)]">
                                  #{tag}
                                </span>
                              ))}
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-1.5 sm:flex-col sm:items-end">
                            <button
                              type="button"
                              disabled={favoriteBusyId === file.recordId}
                              onClick={(event) => { event.stopPropagation(); void toggleFavorite(file); }}
                              className={[
                                "inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition",
                                favorite ? "bg-amber-500/10 text-amber-600" : "text-[var(--muted-strong)] hover:bg-[var(--card)] hover:text-[var(--foreground)]",
                              ].join(" ")}
                              title={favorite ? "取消收藏" : "收藏"}
                            >
                              <StarIcon filled={favorite} />
                              <span>{favorite ? "已收藏" : "收藏"}</span>
                            </button>
                            <button
                              type="button"
                              onClick={(event) => { event.stopPropagation(); setSelectedFile(file); }}
                              className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-[var(--muted-strong)] transition hover:bg-[var(--card)] hover:text-[var(--foreground)]"
                            >
                              详情
                            </button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
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
          <div className="relative flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--card)] shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-[var(--line)] px-5 py-4">
              <div className="min-w-0">
                <p className="text-xs text-[var(--muted)]">
                  {fileKind(selectedFile.mimeType)} · {formatSize(selectedFile.byteSize)} · {formatDateTime(selectedFile.createdAt)}
                </p>
                <h3 className="mt-1 truncate text-base font-semibold text-[var(--foreground)]">{selectedFile.originalName}</h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedFile(null)}
                className="cursor-pointer rounded-lg px-2 py-1 text-sm text-[var(--muted)] transition hover:bg-rose-500 hover:text-white active:bg-rose-600"
              >
                关闭
              </button>
            </div>

            <div className="hide-scrollbar grid min-h-0 flex-1 gap-5 overflow-y-auto px-5 py-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
              <PreviewPane file={selectedFile} />

              <div className="space-y-3">
                <DetailBlock title="AI 摘要">
                  <p className="whitespace-pre-wrap">
                    {selectedFile.recordSummary || selectedFile.description || "暂无摘要。保存时开启 AI 识别后，这里会自动沉淀摘要。"}
                  </p>
                </DetailBlock>

                <DetailBlock title="来源与描述">
                  <dl className="grid gap-3 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-xs text-[var(--muted)]">来源</dt>
                      <dd className="mt-1 truncate text-[var(--foreground)]">{selectedFile.recordSourceLabel || "手动收件箱"}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-[var(--muted)]">记录</dt>
                      <dd className="mt-1 truncate text-[var(--foreground)]">{selectedFile.recordTitle}</dd>
                    </div>
                    <div className="sm:col-span-2">
                      <dt className="text-xs text-[var(--muted)]">文件描述</dt>
                      <dd className="mt-1 whitespace-pre-wrap text-[var(--foreground)]">
                        {selectedFile.description || "暂无单文件描述"}
                      </dd>
                    </div>
                  </dl>
                </DetailBlock>

                {(selectedFile.tags.length > 0 || selectedFile.recordKeywords.length > 0) && (
                  <DetailBlock title="自动标签">
                    <div className="flex flex-wrap gap-2">
                      {[...selectedFile.tags, ...selectedFile.recordKeywords].map((tag) => (
                        <span key={tag} className="rounded-lg bg-[var(--card)] px-2.5 py-1 text-xs text-[var(--muted-strong)]">#{tag}</span>
                      ))}
                    </div>
                  </DetailBlock>
                )}

                {selectedAnalysisText && (
                  <DetailBlock title={selectedFile.mimeType.startsWith("image/") ? "OCR 识别" : "文档抽取 / 解析"}>
                    <p className="max-h-72 overflow-y-auto whitespace-pre-wrap text-xs leading-5">
                      {selectedAnalysisText}
                    </p>
                  </DetailBlock>
                )}

                {selectedFile.recordActionItems.length > 0 && (
                  <DetailBlock title="AI 待办">
                    <ul className="space-y-1">
                      {selectedFile.recordActionItems.map((item) => (
                        <li key={item} className="flex gap-2">
                          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--foreground)]" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </DetailBlock>
                )}
              </div>
            </div>

            <div className="flex flex-wrap justify-end gap-2 border-t border-[var(--line)] px-5 py-4">
              <button
                type="button"
                disabled={favoriteBusyId === selectedFile.recordId}
                onClick={() => toggleFavorite(selectedFile)}
                className="inline-flex items-center gap-2 rounded-lg border border-[var(--line)] px-3 py-2 text-sm text-[var(--muted-strong)] transition hover:bg-[var(--surface)] hover:text-[var(--foreground)] disabled:opacity-50"
              >
                <StarIcon filled={favoriteIds.has(selectedFile.recordId)} />
                {favoriteIds.has(selectedFile.recordId) ? "取消收藏" : "收藏"}
              </button>
              <a href={buildAssetPath(selectedFile.id)} target="_blank" rel="noreferrer" className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm text-[var(--muted-strong)] transition hover:bg-[var(--surface)] hover:text-[var(--foreground)]">
                新窗口打开
              </a>
              <a href={`/?tab=history&record=${selectedFile.recordId}`} className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm text-[var(--muted-strong)] transition hover:bg-[var(--surface)] hover:text-[var(--foreground)]">
                查看信源
              </a>
              <a href={buildAssetPath(selectedFile.id, true)} className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm text-[var(--muted-strong)] transition hover:bg-[var(--surface)] hover:text-[var(--foreground)]">
                下载
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
