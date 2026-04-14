"use client";

import Link from "next/link";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Project, ProjectTask, TaskLinkedSource } from "@/lib/projects";
import type { TodoPriority } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";

function emitGlobal(message: string, tone: "info" | "success" | "error" = "info") {
  try {
    window.dispatchEvent(new CustomEvent("ai-box-global-status", { detail: { message, tone } }));
  } catch {
    /* ignore */
  }
}

function broadcastProjectsCount(count: number) {
  try {
    window.dispatchEvent(new CustomEvent("ai-box-projects-count", { detail: { count } }));
  } catch {
    /* ignore */
  }
}

const priorities: TodoPriority[] = ["low", "medium", "high", "urgent"];

/** 与待办模块 `todo-panel` 的 priorityConfig 一致 */
const priorityConfig: Record<TodoPriority, { label: string; bg: string }> = {
  urgent: { label: "紧急", bg: "bg-rose-500/10 text-rose-600" },
  high: { label: "高", bg: "bg-orange-500/10 text-orange-600" },
  medium: { label: "中", bg: "bg-blue-500/10 text-blue-600" },
  low: { label: "低", bg: "bg-gray-400/10 text-gray-500" },
};

const TAG_COLORS = [
  { bg: "bg-violet-500/20", text: "text-violet-300", border: "border-violet-500/30" },
  { bg: "bg-blue-500/20",   text: "text-blue-300",   border: "border-blue-500/30" },
  { bg: "bg-cyan-500/20",   text: "text-cyan-300",   border: "border-cyan-500/30" },
  { bg: "bg-emerald-500/20",text: "text-emerald-300",border: "border-emerald-500/30" },
  { bg: "bg-amber-500/20",  text: "text-amber-300",  border: "border-amber-500/30" },
  { bg: "bg-rose-500/20",   text: "text-rose-300",   border: "border-rose-500/30" },
  { bg: "bg-orange-500/20", text: "text-orange-300", border: "border-orange-500/30" },
  { bg: "bg-pink-500/20",   text: "text-pink-300",   border: "border-pink-500/30" },
] as const;

function getTagColor(tag: string, allTags: string[]) {
  const idx = allTags.indexOf(tag);
  return TAG_COLORS[(idx >= 0 ? idx : 0) % TAG_COLORS.length];
}

/** 乐观添加任务：尚未落库前用此前缀，禁止 PATCH/同步直到替换为服务端 id */
const LOCAL_PROJECT_TASK_PREFIX = "local_ptask_";

function completedDayKey(task: ProjectTask): string {
  const iso = task.completedAt || task.updatedAt;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "1970-01-01";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function completedSortTime(task: ProjectTask): number {
  return new Date(task.completedAt || task.updatedAt).getTime();
}

/**
 * 合并远端列表与当前界面：只要本地已是「已完成」，就绝不拿接口里滞后的「未完成」快照覆盖
 *（避免在途 GET / 副本延迟导致勾选动画结束后又弹回未完成）
 */
function mergeIncomingTasks(prev: ProjectTask[], incoming: ProjectTask[]): ProjectTask[] {
  const prevMap = new Map(prev.map((t) => [t.id, t]));
  return incoming.map((inc) => {
    const p = prevMap.get(inc.id);
    if (p?.status === "done" && inc.status === "pending") {
      return p;
    }
    return inc;
  });
}

const TITLE_TICK_SYNCED_RESEND = "已同步滴答清单 · 点我重发";
const TITLE_TICK_SYNCED = "已同步滴答清单";
const TITLE_TICK_UNSYNCED = "使用设置中的 SMTP + 滴答收件邮箱，点击同步到滴答清单";

function formatTimelineDayLabel(dateKey: string): string {
  const [y, mo, day] = dateKey.split("-").map(Number);
  if (!y || !mo || !day) return dateKey;
  const d = new Date(y, mo - 1, day);
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;
  if (dateKey === todayStr) return "今天";
  if (dateKey === yStr) return "昨天";
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

export function ProjectsPanel({
  initialProjects,
  projectsDeepLink,
  onProjectsDeepLinkConsumed,
}: {
  initialProjects?: Project[];
  /** 由首页 URL 或资料详情「项目中的引用」传入，消费后需 onProjectsDeepLinkConsumed */
  projectsDeepLink?: { projectId: string; taskId?: string } | null;
  onProjectsDeepLinkConsumed?: () => void;
} = {}) {
  const [projects, setProjects] = useState<Project[]>(() => initialProjects ?? []);
  const [loading, setLoading] = useState(() => initialProjects === undefined);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tasks, setTasks] = useState<ProjectTask[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newTaskContent, setNewTaskContent] = useState("");
  const [editingProject, setEditingProject] = useState(false);
  const [projectNameEdit, setProjectNameEdit] = useState("");
  const [projectDescEdit, setProjectDescEdit] = useState("");
  const [syncingTaskId, setSyncingTaskId] = useState<string | null>(null);
  const [batchSyncing, setBatchSyncing] = useState(false);
  const [completingIds, setCompletingIds] = useState<Set<string>>(() => new Set());
  const [showCompletedTasks, setShowCompletedTasks] = useState(false);
  const [linksByTaskId, setLinksByTaskId] = useState<Record<string, TaskLinkedSource[]>>({});
  /** 当前项目下任务↔信源映射是否在请求中（避免详情里「关联信源」先空白再突然出现） */
  const [taskLinksLoading, setTaskLinksLoading] = useState(false);
  const taskLinksFetchProjectRef = useRef<string | null>(null);
  const [linkPickerTaskId, setLinkPickerTaskId] = useState<string | null>(null);
  const [pickCandidates, setPickCandidates] = useState<
    Array<{ id: string; title: string; sourceLabel: string; confirmedAt?: string | null }>
  >([]);
  const [pickLoading, setPickLoading] = useState(false);
  const [pickedRecordIds, setPickedRecordIds] = useState<string[]>([]);
  const [sourceSaveLoading, setSourceSaveLoading] = useState(false);
  const [sourceSearchQuery, setSourceSearchQuery] = useState("");
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null);
  const [renamingProjectId, setRenamingProjectId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [projectMenuOpenId, setProjectMenuOpenId] = useState<string | null>(null);
  const [projectMenuAnchor, setProjectMenuAnchor] = useState<DOMRect | null>(null);
  const newTaskTextareaRef = useRef<HTMLTextAreaElement>(null);
  const tagInputRef = useRef<HTMLInputElement>(null);
  const [activeTagFilter, setActiveTagFilter] = useState<string | null>(null);
  const [tagInputTaskId, setTagInputTaskId] = useState<string | null>(null);
  const [tagInputValue, setTagInputValue] = useState("");
  const pendingOpenTaskDetailRef = useRef<{ projectId: string; taskId: string } | null>(null);
  const selectedIdRef = useRef<string | null>(null);
  selectedIdRef.current = selectedId;
  const tasksByProjectRef = useRef<Map<string, ProjectTask[]>>(new Map());
  /** 任务列表请求世代：本地 PATCH 后递增，丢弃仍返回旧列表的在途 GET，避免「已完成又出现」 */
  const tasksFetchGenRef = useRef(0);
  const bumpTasksFetchGen = useCallback(() => {
    tasksFetchGenRef.current += 1;
  }, []);

  function formatDueInput(iso: string | null): string {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const h = String(d.getHours()).padStart(2, "0");
    const mi = String(d.getMinutes()).padStart(2, "0");
    return `${y}-${mo}-${day} ${h}:${mi}`;
  }

  const loadProjects = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent === true;
    if (!silent) setLoading(true);
    try {
      const res = await fetch("/api/projects", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "加载失败");
      const list = (data.projects || []) as Project[];
      setProjects(list);
      broadcastProjectsCount(list.length);
      setSelectedId((prev) => {
        if (prev && list.some((p: Project) => p.id === prev)) return prev;
        return list[0]?.id ?? null;
      });
    } catch (e) {
      emitGlobal(e instanceof Error ? e.message : "项目列表加载失败", "error");
      setProjects([]);
      broadcastProjectsCount(0);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  const loadTaskSourceLinks = useCallback(async (projectId: string) => {
    taskLinksFetchProjectRef.current = projectId;
    setTaskLinksLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/task-source-links`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "加载失败");
      if (taskLinksFetchProjectRef.current === projectId) {
        setLinksByTaskId((data.linksByTaskId || {}) as Record<string, TaskLinkedSource[]>);
      }
    } catch (e) {
      if (taskLinksFetchProjectRef.current === projectId) {
        setLinksByTaskId({});
      }
      emitGlobal(e instanceof Error ? e.message : "信源关联加载失败", "error");
    } finally {
      if (taskLinksFetchProjectRef.current === projectId) {
        setTaskLinksLoading(false);
        taskLinksFetchProjectRef.current = null;
      }
    }
  }, []);

  const loadTasks = useCallback(
    async (projectId: string, opts?: { showLoading?: boolean }) => {
      const showLoading = opts?.showLoading !== false;
      const gen = ++tasksFetchGenRef.current;
      if (showLoading) setTasksLoading(true);
      try {
        const res = await fetch(`/api/projects/${projectId}/tasks`, { cache: "no-store" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "加载失败");
        const list = (data.tasks || []) as ProjectTask[];
        if (tasksFetchGenRef.current !== gen) return;
        if (selectedIdRef.current !== projectId) return;
        setTasks((prev) => {
          const merged = mergeIncomingTasks(prev, list);
          tasksByProjectRef.current.set(projectId, merged);
          return merged;
        });
        void loadTaskSourceLinks(projectId);
      } catch {
        if (tasksFetchGenRef.current !== gen) return;
        if (selectedIdRef.current === projectId) {
          if (!tasksByProjectRef.current.get(projectId)) setTasks([]);
          setTaskLinksLoading(false);
          taskLinksFetchProjectRef.current = null;
        }
      } finally {
        if (selectedIdRef.current === projectId && showLoading) setTasksLoading(false);
      }
    },
    [loadTaskSourceLinks],
  );

  useEffect(() => {
    if (initialProjects === undefined) return;
    setProjects(initialProjects);
    broadcastProjectsCount(initialProjects.length);
    setSelectedId((prev) => {
      if (prev && initialProjects.some((p) => p.id === prev)) return prev;
      return initialProjects[0]?.id ?? null;
    });
    setLoading(false);
    void loadProjects({ silent: true });
  }, [initialProjects, loadProjects]);

  useEffect(() => {
    if (initialProjects !== undefined) return;
    void loadProjects();
  }, [loadProjects, initialProjects]);

  useEffect(() => {
    if (!selectedId) {
      setTasks([]);
      setTasksLoading(false);
      return;
    }
    const pid = selectedId;
    const cached = tasksByProjectRef.current.get(pid);
    if (cached) {
      setTasks(cached);
      setTasksLoading(false);
      void loadTasks(pid, { showLoading: false });
    } else {
      void loadTasks(pid, { showLoading: true });
    }
  }, [selectedId, loadTasks]);

  useEffect(() => {
    setShowCompletedTasks(false);
  }, [selectedId]);

  useEffect(() => {
    if (!selectedId) {
      setLinksByTaskId({});
      setTaskLinksLoading(false);
      taskLinksFetchProjectRef.current = null;
      return;
    }
    setLinksByTaskId({});
    setTaskLinksLoading(true);
  }, [selectedId]);

  // 切换项目时重置标签筛选
  useEffect(() => {
    setActiveTagFilter(null);
    setTagInputTaskId(null);
  }, [selectedId]);

  useEffect(() => {
    if (!projectsDeepLink) return;
    const { projectId, taskId } = projectsDeepLink;
    setSelectedId(projectId);
    if (taskId) pendingOpenTaskDetailRef.current = { projectId, taskId };
    else pendingOpenTaskDetailRef.current = null;
    onProjectsDeepLinkConsumed?.();
  }, [projectsDeepLink, onProjectsDeepLinkConsumed]);

  useEffect(() => {
    const pending = pendingOpenTaskDetailRef.current;
    if (!pending || tasksLoading) return;
    if (selectedId !== pending.projectId) return;
    if (tasks.some((t) => t.id === pending.taskId)) {
      setDetailTaskId(pending.taskId);
    }
    pendingOpenTaskDetailRef.current = null;
  }, [tasks, tasksLoading, selectedId]);

  const selected = projects.find((p) => p.id === selectedId) || null;

  const detailTask = useMemo(
    () => (detailTaskId ? tasks.find((t) => t.id === detailTaskId) ?? null : null),
    [tasks, detailTaskId],
  );

  const filteredPickCandidates = useMemo(() => {
    const q = sourceSearchQuery.trim().toLowerCase();
    if (!q) return pickCandidates;
    return pickCandidates.filter((c) => {
      const title = (c.title || "").toLowerCase();
      const src = (c.sourceLabel || "").toLowerCase();
      return title.includes(q) || src.includes(q);
    });
  }, [pickCandidates, sourceSearchQuery]);

  useEffect(() => {
    if (selected) {
      setProjectNameEdit(selected.name);
      setProjectDescEdit(selected.description);
    }
  }, [selected?.id, selected?.name, selected?.description]);

  async function handleCreateProject(e: React.FormEvent) {
    e.preventDefault();
    const name = newProjectName.trim();
    if (!name) return;
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const raw = await res.text();
      let data: { project?: Project; error?: string };
      try {
        data = JSON.parse(raw) as { project?: Project; error?: string };
      } catch {
        throw new Error("服务器返回异常（可能未登录或会话过期），请刷新页面或重新登录后再试");
      }
      if (!res.ok) throw new Error(data.error || "创建失败");
      const project = data.project;
      if (!project?.id) throw new Error(data.error || "创建失败：未返回项目数据");
      setNewProjectName("");
      setProjects((prev) => {
        const next = [...prev, project];
        broadcastProjectsCount(next.length);
        return next;
      });
      setSelectedId(project.id);
      emitGlobal("项目已创建", "success");
    } catch (err) {
      emitGlobal(err instanceof Error ? err.message : "创建失败", "error");
    }
  }

  async function saveProjectMeta() {
    if (!selectedId) return;
    try {
      const res = await fetch(`/api/projects/${selectedId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: projectNameEdit.trim(), description: projectDescEdit }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "保存失败");
      setEditingProject(false);
      emitGlobal("已保存", "success");
      void loadProjects();
    } catch (err) {
      emitGlobal(err instanceof Error ? err.message : "保存失败", "error");
    }
  }

  async function renameProject(projectId: string, newName: string) {
    const name = newName.trim();
    if (!name) { setRenamingProjectId(null); return; }
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "保存失败");
      setRenamingProjectId(null);
      setProjects((prev) => prev.map((p) => (p.id === projectId ? { ...p, name } : p)));
      emitGlobal("已重命名", "success");
    } catch (err) {
      emitGlobal(err instanceof Error ? err.message : "重命名失败", "error");
    }
  }

  async function deleteProject() {
    if (!selectedId || !selected) return;
    if (!window.confirm(`确定删除项目「${selected.name}」及其中全部任务？`)) return;
    try {
      const res = await fetch(`/api/projects/${selectedId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "删除失败");
      setProjects((prev) => {
        const next = prev.filter((p) => p.id !== selectedId);
        broadcastProjectsCount(next.length);
        return next;
      });
      tasksByProjectRef.current.delete(selectedId);
      setSelectedId(null);
      emitGlobal("项目已删除", "success");
    } catch (err) {
      emitGlobal(err instanceof Error ? err.message : "删除失败", "error");
    }
  }

  async function addTask(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedId) return;
    const content = newTaskContent.trim();
    if (!content) return;
    const nowIso = new Date().toISOString();
    const tempId = `${LOCAL_PROJECT_TASK_PREFIX}${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    const optimistic: ProjectTask = {
      id: tempId,
      projectId: selectedId,
      content,
      status: "pending",
      priority: "medium",
      dueAt: null,
      sortOrder: Number.MAX_SAFE_INTEGER,
      syncedAt: null,
      completedAt: null,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    setNewTaskContent("");
    setTasks((prev) => {
      const next = [...prev, optimistic];
      tasksByProjectRef.current.set(selectedId, next);
      return next;
    });
    bumpTasksFetchGen();
    try {
      const res = await fetch(`/api/projects/${selectedId}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "添加失败");
      const created = data.task as ProjectTask;
      setTasks((prev) => {
        const next = prev.map((t) => (t.id === tempId ? created : t));
        tasksByProjectRef.current.set(selectedId, next);
        return next;
      });
      bumpTasksFetchGen();
      queueMicrotask(() => {
        void loadProjects();
      });
    } catch (err) {
      setTasks((prev) => {
        const next = prev.filter((t) => t.id !== tempId);
        tasksByProjectRef.current.set(selectedId, next);
        return next;
      });
      bumpTasksFetchGen();
      setNewTaskContent(content);
      emitGlobal(err instanceof Error ? err.message : "添加失败", "error");
    }
  }

  async function patchTask(task: ProjectTask, fields: Partial<ProjectTask>): Promise<ProjectTask | null> {
    if (task.id.startsWith(LOCAL_PROJECT_TASK_PREFIX)) return null;
    if (!selectedId) return null;
    bumpTasksFetchGen();
    try {
      const res = await fetch(`/api/projects/${selectedId}/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: fields.content,
          status: fields.status,
          priority: fields.priority,
          dueAt: fields.dueAt,
          tags: fields.tags,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "更新失败");
      const updated = data.task as ProjectTask;
      setTasks((prev) => {
        const next = prev.map((t) => (t.id === task.id ? updated : t));
        tasksByProjectRef.current.set(selectedId, next);
        return next;
      });
      bumpTasksFetchGen();
      if (fields.status !== undefined) void loadProjects();
      return updated;
    } catch (err) {
      emitGlobal(err instanceof Error ? err.message : "更新失败", "error");
      return null;
    }
  }

  async function toggleTaskDone(task: ProjectTask, done: boolean) {
    if (task.id.startsWith(LOCAL_PROJECT_TASK_PREFIX)) {
      emitGlobal("任务正在保存，请稍后再勾选", "info");
      return;
    }
    if (done) {
      setCompletingIds((s) => new Set(s).add(task.id));
      await new Promise((r) => setTimeout(r, 280));
      const nowIso = new Date().toISOString();
      const optimistic: ProjectTask = {
        ...task,
        status: "done",
        completedAt: task.completedAt ?? nowIso,
        updatedAt: nowIso,
      };
      setTasks((prev) => {
        const next = prev.map((t) => (t.id === task.id ? optimistic : t));
        if (selectedId) tasksByProjectRef.current.set(selectedId, next);
        return next;
      });
      bumpTasksFetchGen();
      const next = await patchTask(task, { status: "done" });
      setCompletingIds((s) => {
        const n = new Set(s);
        n.delete(task.id);
        return n;
      });
      if (!next) {
        setTasks((prev) => {
          const reverted = prev.map((t) => (t.id === task.id ? task : t));
          if (selectedId) tasksByProjectRef.current.set(selectedId, reverted);
          return reverted;
        });
        bumpTasksFetchGen();
        void loadTasks(selectedId!, { showLoading: true });
      }
      return;
    }
    setCompletingIds((s) => {
      const n = new Set(s);
      n.delete(task.id);
      return n;
    });
    await patchTask(task, { status: "pending" });
  }

  async function removeTask(task: ProjectTask) {
    if (task.id.startsWith(LOCAL_PROJECT_TASK_PREFIX)) {
      setTasks((prev) => {
        const next = prev.filter((t) => t.id !== task.id);
        if (selectedId) tasksByProjectRef.current.set(selectedId, next);
        return next;
      });
      bumpTasksFetchGen();
      return;
    }
    if (!selectedId) return;
    if (!window.confirm("删除此任务？")) return;
    try {
      const res = await fetch(`/api/projects/${selectedId}/tasks/${task.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "删除失败");
      }
      setTasks((prev) => {
        const next = prev.filter((t) => t.id !== task.id);
        tasksByProjectRef.current.set(selectedId, next);
        return next;
      });
      bumpTasksFetchGen();
      void loadProjects();
    } catch (err) {
      emitGlobal(err instanceof Error ? err.message : "删除失败", "error");
    }
  }

  async function syncOne(task: ProjectTask) {
    if (task.id.startsWith(LOCAL_PROJECT_TASK_PREFIX)) return;
    if (!selectedId) return;
    setSyncingTaskId(task.id);
    try {
      const res = await fetch(`/api/projects/${selectedId}/tasks/${task.id}/sync`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "同步失败");
      setTasks((prev) => {
        const next = prev.map((t) => (t.id === task.id ? data.task : t));
        tasksByProjectRef.current.set(selectedId, next);
        return next;
      });
      bumpTasksFetchGen();
      emitGlobal(data.message || "已投递到滴答", "success");
    } catch (err) {
      emitGlobal(err instanceof Error ? err.message : "同步失败", "error");
    } finally {
      setSyncingTaskId(null);
    }
  }

  async function saveDueAndSync(task: ProjectTask, iso: string | null) {
    if (task.id.startsWith(LOCAL_PROJECT_TASK_PREFIX)) return;
    const updated = await patchTask(task, { dueAt: iso });
    if (iso != null && updated && updated.status === "pending") {
      await syncOne(updated);
    }
  }

  async function syncBatch() {
    if (!selectedId) return;
    setBatchSyncing(true);
    try {
      const res = await fetch(`/api/projects/${selectedId}/tasks/sync-batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "批量同步失败");
      await loadTasks(selectedId, { showLoading: false });
      emitGlobal(
        data.failed > 0
          ? `已投递 ${data.synced} 条，失败 ${data.failed} 条`
          : `已投递 ${data.synced} 条到滴答`,
        data.failed > 0 ? "error" : "success",
      );
    } catch (err) {
      emitGlobal(err instanceof Error ? err.message : "批量同步失败", "error");
    } finally {
      setBatchSyncing(false);
    }
  }

  const tasksNeedingSync = tasks.filter(
    (t) => t.status === "pending" && (!t.syncedAt || (t.updatedAt && t.syncedAt && t.updatedAt > t.syncedAt)),
  );

  const projectTags = useMemo(() => {
    const all = new Set<string>();
    for (const t of tasks) {
      for (const tag of t.tags ?? []) all.add(tag);
    }
    return Array.from(all);
  }, [tasks]);

  const visibleTasks = tasks.filter((t) => {
    if (t.status !== "pending" && !completingIds.has(t.id)) return false;
    if (activeTagFilter) {
      if (!(t.tags ?? []).includes(activeTagFilter)) return false;
    }
    return true;
  });
  const doneTaskCount = tasks.filter((t) => t.status === "done").length;
  const pendingCount = tasks.filter((t) => t.status === "pending").length;

  useEffect(() => {
    if (doneTaskCount === 0 && showCompletedTasks) setShowCompletedTasks(false);
  }, [doneTaskCount, showCompletedTasks]);

  const groupedDoneTasks = useMemo(() => {
    const done = tasks.filter((t) => t.status === "done");
    const byDay = new Map<string, ProjectTask[]>();
    for (const t of done) {
      const key = completedDayKey(t);
      const arr = byDay.get(key) ?? [];
      arr.push(t);
      byDay.set(key, arr);
    }
    const keys = Array.from(byDay.keys()).sort((a, b) => b.localeCompare(a));
    return keys.map((dateKey) => {
      const items = (byDay.get(dateKey) ?? []).sort((a, b) => completedSortTime(b) - completedSortTime(a));
      return { dateKey, label: formatTimelineDayLabel(dateKey), items };
    });
  }, [tasks]);

  const openTaskSourcePicker = useCallback(
    async (taskId: string) => {
      setDetailTaskId(null);
      setSourceSearchQuery("");
      setLinkPickerTaskId(taskId);
      setPickedRecordIds((linksByTaskId[taskId] || []).map((l) => l.recordId));
      setPickLoading(true);
      setPickCandidates([]);
      try {
        const res = await fetch("/api/records?forTaskLink=1&limit=500&offset=0", { cache: "no-store" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "加载失败");
        const rows = (data.records || []) as Array<{
          id: string;
          title: string;
          sourceLabel: string;
          confirmedAt?: string | null;
        }>;
        setPickCandidates(
          rows.map((r) => ({
            id: r.id,
            title: r.title,
            sourceLabel: r.sourceLabel || "",
            confirmedAt: r.confirmedAt ?? null,
          })),
        );
      } catch (e) {
        emitGlobal(e instanceof Error ? e.message : "加载资料列表失败", "error");
      } finally {
        setPickLoading(false);
      }
    },
    [linksByTaskId],
  );

  async function saveTaskSourceSelection() {
    if (!selectedId || !linkPickerTaskId) return;
    const taskId = linkPickerTaskId;
    setSourceSaveLoading(true);
    try {
      const res = await fetch(`/api/projects/${selectedId}/tasks/${taskId}/records`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recordIds: pickedRecordIds }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "保存失败");
      const links = (data.links || []) as TaskLinkedSource[];
      setLinksByTaskId((prev) => ({ ...prev, [taskId]: links }));
      setLinkPickerTaskId(null);
      emitGlobal("已保存任务关联", "success");
    } catch (e) {
      emitGlobal(e instanceof Error ? e.message : "保存失败", "error");
    } finally {
      setSourceSaveLoading(false);
    }
  }

  useEffect(() => {
    if (!linkPickerTaskId) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLinkPickerTaskId(null);
    };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [linkPickerTaskId]);

  useEffect(() => {
    if (!detailTaskId) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDetailTaskId(null);
    };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [detailTaskId]);

  useEffect(() => {
    if (!projectMenuOpenId) return;
    const onClose = (e: MouseEvent) => {
      if (!(e.target as Element).closest?.("[data-project-menu-portal]")) {
        setProjectMenuOpenId(null);
      }
    };
    document.addEventListener("mousedown", onClose, true);
    return () => document.removeEventListener("mousedown", onClose, true);
  }, [projectMenuOpenId]);

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row lg:gap-6">
      {/* 项目列表 */}
      <aside className="flex min-h-0 w-full shrink-0 flex-col rounded-xl border border-[var(--line)] bg-[var(--card)] lg:w-72">
        <div className="border-b border-[var(--line)] p-4">
          <h2 className="text-sm font-semibold text-[var(--foreground)]">项目</h2>
          <form onSubmit={handleCreateProject} className="mt-3 flex gap-2">
            <input
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              placeholder="新建项目名称"
              className="input-focus-bar min-w-0 flex-1 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm outline-none"
            />
            <button
              type="submit"
              className="shrink-0 rounded-lg bg-[var(--foreground)] px-3 py-2 text-xs font-medium text-[var(--background)]"
            >
              添加
            </button>
          </form>
        </div>
        <div className="max-h-[40vh] min-h-0 flex-1 overflow-y-auto p-2 lg:max-h-none">
          {loading ? (
            <div className="flex flex-col items-center justify-center gap-2 px-2 py-8">
              <span className="h-7 w-7 animate-spin rounded-full border-2 border-[var(--muted)] border-t-[var(--foreground)]" aria-hidden />
              <p className="text-center text-xs text-[var(--muted)]">加载项目…</p>
            </div>
          ) : projects.length === 0 ? (
            <p className="px-2 py-4 text-center text-xs text-[var(--muted)]">暂无项目，先创建一个吧</p>
          ) : (
            <ul className="space-y-0.5">
              {projects.map((p) => {
                const isSelected = selectedId === p.id;
                const isRenaming = renamingProjectId === p.id;
                return (
                  <li key={p.id}>
                    {isRenaming ? (
                      <form
                        className="flex items-center gap-1.5 rounded-xl border border-[var(--foreground)]/20 bg-[var(--sidebar-active)] px-3 py-2"
                        onSubmit={(e) => { e.preventDefault(); void renameProject(p.id, renameValue); }}
                      >
                        <input
                          autoFocus
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Escape") setRenamingProjectId(null); }}
                          onBlur={() => void renameProject(p.id, renameValue)}
                          className="min-w-0 flex-1 rounded bg-transparent text-sm font-semibold text-[var(--foreground)] outline-none"
                          placeholder="项目名称"
                        />
                      </form>
                    ) : (
                      <div
                        className={[
                          "group relative flex w-full items-center gap-1 overflow-hidden rounded-xl pl-4 pr-1.5 py-2.5 text-left text-sm transition",
                          isSelected
                            ? "project-list-item--active font-semibold text-[var(--foreground)] border border-dashed border-white/25"
                            : "border border-transparent text-[var(--muted-strong)] hover:bg-[var(--sidebar-active)] hover:text-[var(--foreground)]",
                        ].join(" ")}
                      >
                        <button
                          type="button"
                          onClick={() => setSelectedId(p.id)}
                          className="flex min-w-0 flex-1 flex-col text-left"
                        >
                          <span className="truncate">{p.name}</span>
                          <span className="mt-0.5 text-[10px] text-[var(--muted)]">
                            {p.doneCount ?? 0}/{p.totalTasks ?? 0} 完成
                          </span>
                        </button>
                        <button
                          type="button"
                          title="更多操作"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedId(p.id);
                            setProjectMenuAnchor(e.currentTarget.getBoundingClientRect());
                            setProjectMenuOpenId((prev) => (prev === p.id ? null : p.id));
                          }}
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md opacity-0 transition hover:bg-[var(--surface-strong)] group-hover:opacity-100"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                            <circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" />
                          </svg>
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </aside>

      {/* 任务区 */}
      <section className="flex min-h-0 min-w-0 flex-1 flex-col rounded-xl border border-[var(--line)] bg-[var(--card)]">
        {!selected ? (
          <div className="flex flex-1 items-center justify-center p-8 text-sm text-[var(--muted)]">
            请选择左侧项目
          </div>
        ) : (
          <>
            <div className="border-b border-[var(--line)] p-4">
              {!editingProject ? (
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-lg font-semibold text-[var(--foreground)]">{selected.name}</h2>
                    {selected.description ? (
                      <p className="mt-1 text-xs text-[var(--muted)]">{selected.description}</p>
                    ) : null}
                    <p className="mt-2 text-[11px] text-[var(--muted)]">
                      {showCompletedTasks
                        ? `已完成 ${doneTaskCount} 条 · 按完成日时间线查看`
                        : `未完成 ${pendingCount} 条 · 合计 ${tasks.length} 条`}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {doneTaskCount > 0 ? (
                      <button
                        type="button"
                        onClick={() => setShowCompletedTasks((v) => !v)}
                        className={[
                          "rounded-lg border px-3 py-1.5 text-xs font-medium transition",
                          showCompletedTasks
                            ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-800 dark:text-emerald-300"
                            : "border-[var(--line)] text-[var(--muted-strong)] hover:bg-[var(--surface)]",
                        ].join(" ")}
                      >
                        {showCompletedTasks ? "返回未完成" : `已完成 (${doneTaskCount})`}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => setEditingProject(true)}
                      className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs text-[var(--muted-strong)] hover:bg-[var(--surface)]"
                    >
                      编辑
                    </button>
                    {!showCompletedTasks && tasksNeedingSync.length > 0 ? (
                      <button
                        type="button"
                        onClick={syncBatch}
                        disabled={batchSyncing}
                        className="rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-xs font-medium text-[var(--muted-strong)] hover:bg-[var(--surface-strong)] disabled:opacity-50"
                      >
                        {batchSyncing ? "同步中…" : `全部同步到滴答 (${tasksNeedingSync.length})`}
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <input
                    value={projectNameEdit}
                    onChange={(e) => setProjectNameEdit(e.target.value)}
                    className="input-focus-bar w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm font-semibold"
                    placeholder="项目名称"
                  />
                  <textarea
                    value={projectDescEdit}
                    onChange={(e) => setProjectDescEdit(e.target.value)}
                    rows={2}
                    placeholder="项目说明（可选）"
                    className="input-focus-bar w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-xs"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => void saveProjectMeta()}
                      className="rounded-lg bg-[var(--foreground)] px-3 py-1.5 text-xs font-medium text-[var(--background)]"
                    >
                      保存
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingProject(false)}
                      className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs"
                    >
                      取消
                    </button>
                  </div>
                </div>
              )}
            </div>

            {!showCompletedTasks ? (
              <form onSubmit={addTask} className="flex items-end gap-2 border-b border-[var(--line)] px-3 pt-3 pb-3">
                <textarea
                  ref={newTaskTextareaRef}
                  rows={1}
                  value={newTaskContent}
                  onChange={(e) => {
                    setNewTaskContent(e.target.value);
                    const el = e.target;
                    el.style.height = "auto";
                    el.style.height = `${el.scrollHeight}px`;
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      e.currentTarget.form?.requestSubmit();
                    }
                  }}
                  placeholder="新增任务，回车或点添加"
                  className="input-focus-bar min-w-0 flex-1 resize-none overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm leading-normal"
                  style={{ minHeight: "36px" }}
                />
                <button
                  type="submit"
                  className="mb-0 shrink-0 rounded-lg bg-[var(--foreground)] px-4 py-2 text-xs font-medium text-[var(--background)]"
                >
                  添加任务
                </button>
              </form>
            ) : null}

            {/* 标签筛选行 */}
            {projectTags.length > 0 && !showCompletedTasks && (
              <div className="flex items-center gap-1.5 overflow-x-auto border-b border-[var(--line)] px-3 py-2 scrollbar-none">
                <span className="shrink-0 text-[10px] text-[var(--muted)]">标签</span>
                <button
                  type="button"
                  onClick={() => setActiveTagFilter(null)}
                  className={[
                    "shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-medium transition",
                    activeTagFilter === null
                      ? "bg-[var(--foreground)] text-[var(--background)]"
                      : "bg-[var(--surface)] text-[var(--muted-strong)] hover:bg-[var(--surface-strong)]",
                  ].join(" ")}
                >
                  全部
                </button>
                {projectTags.map((tag) => {
                  const color = getTagColor(tag, projectTags);
                  const isActive = activeTagFilter === tag;
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => setActiveTagFilter(isActive ? null : tag)}
                      className={[
                        "shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-medium transition",
                        color.bg, color.text, color.border,
                        isActive ? "opacity-100 ring-1 ring-white/20" : "opacity-60 hover:opacity-100",
                      ].join(" ")}
                    >
                      {tag}
                    </button>
                  );
                })}
              </div>
            )}

            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {tasksLoading ? (
                <div className="flex flex-col items-center justify-center gap-2 py-12">
                  <span className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--muted)] border-t-[var(--foreground)]" aria-hidden />
                  <p className="text-center text-xs text-[var(--muted)]">加载任务…</p>
                </div>
              ) : tasks.length === 0 ? (
                <p className="py-8 text-center text-xs text-[var(--muted)]">暂无任务，在上面输入添加</p>
              ) : showCompletedTasks ? (
                groupedDoneTasks.length === 0 ? (
                  <p className="py-8 text-center text-xs text-[var(--muted)]">暂无已完成任务</p>
                ) : (
                  <div className="space-y-6">
                    {groupedDoneTasks.map((group) => (
                      <div key={group.dateKey}>
                        <div className="mb-2 flex items-center gap-3">
                          <span className="text-xs font-semibold text-[var(--muted)]">{group.label}</span>
                          <span className="text-[10px] tabular-nums text-[var(--muted)]">{group.dateKey}</span>
                          <span className="text-[10px] text-[var(--muted)]">{group.items.length} 条</span>
                          <div className="h-px flex-1 bg-[var(--line)]" />
                        </div>
                        <ul className="space-y-2">
                          {group.items.map((task) => {
                            const needsResync = Boolean(
                              task.syncedAt && task.updatedAt && task.syncedAt && task.updatedAt > task.syncedAt,
                            );
                            const doneAtIso = task.completedAt || task.updatedAt;
                            return (
                              <li
                                key={task.id}
                                className="group relative z-[1] rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3"
                              >
                                <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[minmax(0,1fr)_220px] lg:items-stretch lg:gap-0">
                                  <div className="flex min-w-0 items-start gap-3 border-b border-dashed border-[var(--line)] pb-3 lg:border-b-0 lg:border-r lg:pb-0 lg:pr-4">
                                    <input
                                      id={`ptask-done-cb-${task.id}`}
                                      type="checkbox"
                                      checked
                                      onChange={(e): void => {
                                        if (!e.target.checked) void toggleTaskDone(task, false);
                                      }}
                                      className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-[var(--line)]"
                                      aria-label="标记为未完成"
                                    />
                                    <button
                                      type="button"
                                      className="min-w-0 flex-1 cursor-pointer rounded-lg py-0.5 text-left outline-none ring-[var(--foreground)] hover:bg-[var(--surface-strong)]/80 focus-visible:ring-2 -mx-1 px-1"
                                      onClick={() => setDetailTaskId(task.id)}
                                    >
                                      <p className="text-sm font-medium leading-snug text-[var(--muted)] line-through">
                                        {task.content}
                                      </p>
                                      <div className="mt-1.5 flex flex-wrap gap-x-3 text-[11px] text-[var(--muted)]">
                                        <span>创建 {formatDateTime(task.createdAt)}</span>
                                        <span>完成于 {formatDueInput(doneAtIso)}</span>
                                      </div>
                                    </button>
                                  </div>
                                  <div className="flex w-full min-w-0 flex-wrap items-center gap-2 lg:min-w-[220px] lg:flex-nowrap lg:justify-start lg:pl-4">
                                    <span
                                      className={[
                                        "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-medium",
                                        priorityConfig[task.priority ?? "medium"].bg,
                                      ].join(" ")}
                                    >
                                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-60" />
                                      {priorityConfig[task.priority ?? "medium"].label}
                                    </span>
                                    <button
                                      type="button"
                                      title="关联信源"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        void openTaskSourcePicker(task.id);
                                      }}
                                      className="relative inline-flex shrink-0 rounded-md p-1 text-[var(--muted-strong)] transition hover:bg-[var(--surface)] hover:text-[var(--foreground)]"
                                    >
                                      <svg
                                        width="14"
                                        height="14"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        aria-hidden
                                      >
                                        <path d="M10 13a5 5 0 0 1 0-7l1-1a5 5 0 0 1 7.07 7.07L14 13" />
                                        <path d="M14 11a5 5 0 0 1 0 7l-1 1a5 5 0 0 1-7.07-7.07L10 11" />
                                      </svg>
                                      {(linksByTaskId[task.id]?.length ?? 0) > 0 ? (
                                        <span className="absolute -right-1 -top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-[var(--foreground)] px-0.5 text-[8px] font-bold leading-none text-[var(--background)] tabular-nums">
                                          {(linksByTaskId[task.id]!.length) > 9 ? "9+" : linksByTaskId[task.id]!.length}
                                        </span>
                                      ) : null}
                                    </button>
                                    {task.syncedAt ? (
                                      <button
                                        type="button"
                                        onClick={() => void syncOne(task)}
                                        disabled={syncingTaskId === task.id}
                                        className="shrink-0 border-0 bg-transparent px-0 py-0 text-[10px] font-medium text-emerald-700 underline-offset-2 hover:underline disabled:opacity-50 dark:text-emerald-400"
                                        title={needsResync ? TITLE_TICK_SYNCED_RESEND : TITLE_TICK_SYNCED}
                                      >
                                        {syncingTaskId === task.id ? "…" : "已同步滴答"}
                                      </button>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => void syncOne(task)}
                                        disabled={syncingTaskId === task.id}
                                        className="shrink-0 border-0 bg-transparent px-0 py-0 text-[11px] text-emerald-700 underline-offset-2 hover:underline disabled:opacity-50 dark:text-emerald-400"
                                        title={TITLE_TICK_UNSYNCED}
                                      >
                                        {syncingTaskId === task.id ? "…" : "同步滴答"}
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => void removeTask(task)}
                                      className="rounded-md p-1 text-[var(--muted)] transition hover:bg-rose-500/10 hover:text-rose-500"
                                      title="删除"
                                    >
                                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                        <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14Z" />
                                        <path d="M10 11v6M14 11v6" />
                                      </svg>
                                    </button>
                                  </div>
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    ))}
                  </div>
                )
              ) : visibleTasks.length === 0 ? (
                <p className="py-8 text-center text-xs text-[var(--muted)]">暂无未完成任务，在上面添加新任务</p>
              ) : (
                <ul className="space-y-2">
                  {visibleTasks.map((task) => {
                    const completing = completingIds.has(task.id);
                    const savingLocal = task.id.startsWith(LOCAL_PROJECT_TASK_PREFIX);
                    const needsResync = Boolean(
                      task.syncedAt && task.updatedAt && task.syncedAt && task.updatedAt > task.syncedAt,
                    );
                    return (
                      <li key={task.id}>
                        <div
                          className={[
                            "transition-opacity duration-200 ease-out",
                            completing ? "pointer-events-none opacity-50" : "opacity-100",
                          ].join(" ")}
                        >
                          <div className="group relative z-[1] rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 transition-colors duration-150 hover:border-[var(--line-strong)]">
                            <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[minmax(0,1fr)_220px] lg:items-stretch lg:gap-0">
                              <div className="flex min-w-0 items-start gap-3 border-b border-dashed border-[var(--line)] pb-3 lg:border-b-0 lg:border-r lg:pb-0 lg:pr-4">
                                <input
                                  id={`ptask-pending-cb-${task.id}`}
                                  type="checkbox"
                                  checked={task.status === "done" || completing}
                                  onChange={(e): void => {
                                    void toggleTaskDone(task, e.target.checked);
                                  }}
                                  disabled={completing || savingLocal}
                                  className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-[var(--line)]"
                                  aria-label={task.status === "done" ? "标记为未完成" : "标记为已完成"}
                                />
                                <div className="min-w-0 flex-1">
                                  <button
                                    type="button"
                                    disabled={completing || savingLocal}
                                    className="w-full min-w-0 cursor-pointer rounded-lg py-0.5 text-left outline-none ring-[var(--foreground)] hover:bg-[var(--surface-strong)]/80 focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-60 -mx-1 px-1"
                                    onClick={() => {
                                      if (!completing && !savingLocal) setDetailTaskId(task.id);
                                    }}
                                  >
                                    <span
                                      className={[
                                        "block text-sm font-medium leading-snug",
                                        completing || task.status === "done"
                                          ? "text-[var(--muted)] line-through"
                                          : "text-[var(--foreground)]",
                                      ].join(" ")}
                                    >
                                      {task.content}
                                    </span>
                                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-[var(--muted)]">
                                      <span>创建 {formatDateTime(task.createdAt)}</span>
                                      {completing ? (
                                        <span className="inline-flex rounded-md bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
                                          已完成…
                                        </span>
                                      ) : savingLocal ? (
                                        <span className="inline-flex rounded-md bg-[var(--surface-strong)] px-2 py-0.5 text-[10px] font-medium text-[var(--muted-strong)]">
                                          保存中…
                                        </span>
                                      ) : null}
                                    </div>
                                  </button>
                                  {/* 标签区域 */}
                                  {!completing && !savingLocal && (
                                    <div className="mt-1.5 flex flex-wrap items-center gap-1 -mx-1 px-1">
                                      {(task.tags ?? []).map((tag) => {
                                        const color = getTagColor(tag, projectTags);
                                        return (
                                          <span
                                            key={tag}
                                            className={[
                                              "inline-flex items-center gap-0.5 rounded-full border px-2 py-0.5 text-[10px] font-medium",
                                              color.bg, color.text, color.border,
                                            ].join(" ")}
                                          >
                                            {tag}
                                            <button
                                              type="button"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                void patchTask(task, { tags: (task.tags ?? []).filter((t) => t !== tag) });
                                              }}
                                              className="ml-0.5 opacity-60 hover:opacity-100"
                                              aria-label={`移除标签 ${tag}`}
                                            >
                                              ×
                                            </button>
                                          </span>
                                        );
                                      })}
                                      {/* 添加标签按钮 */}
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          if (tagInputTaskId === task.id) {
                                            setTagInputTaskId(null);
                                            setTagInputValue("");
                                          } else {
                                            setTagInputTaskId(task.id);
                                            setTagInputValue("");
                                            setTimeout(() => tagInputRef.current?.focus(), 50);
                                          }
                                        }}
                                        className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-dashed border-[var(--muted)] text-[10px] text-[var(--muted)] transition hover:border-[var(--foreground)] hover:text-[var(--foreground)]"
                                        title="添加标签"
                                      >
                                        +
                                      </button>
                                    </div>
                                  )}
                                  {/* 标签输入面板 */}
                                  {tagInputTaskId === task.id && (
                                    <div
                                      className="mt-1.5 rounded-lg border border-[var(--line)] bg-[var(--card)] p-2 shadow-md"
                                      onMouseDown={(e) => e.stopPropagation()}
                                    >
                                      <input
                                        ref={tagInputRef}
                                        value={tagInputValue}
                                        onChange={(e) => setTagInputValue(e.target.value)}
                                        onKeyDown={(e) => {
                                          if (e.key === "Enter") {
                                            e.preventDefault();
                                            const val = tagInputValue.trim();
                                            if (val) {
                                              const cur = task.tags ?? [];
                                              if (!cur.includes(val)) void patchTask(task, { tags: [...cur, val] });
                                            }
                                            setTagInputTaskId(null);
                                            setTagInputValue("");
                                          } else if (e.key === "Escape") {
                                            setTagInputTaskId(null);
                                            setTagInputValue("");
                                          }
                                        }}
                                        onBlur={() => {
                                          setTimeout(() => {
                                            setTagInputTaskId(null);
                                            setTagInputValue("");
                                          }, 150);
                                        }}
                                        placeholder="输入标签，回车确认"
                                        className="w-full rounded-md border border-[var(--line)] bg-[var(--surface)] px-2 py-1 text-[11px] outline-none focus:border-[var(--foreground)]/30"
                                      />
                                      {projectTags.filter((t) => !(task.tags ?? []).includes(t)).length > 0 && (
                                        <div className="mt-1.5 flex flex-wrap gap-1">
                                          {projectTags
                                            .filter((t) => !(task.tags ?? []).includes(t))
                                            .map((tag) => {
                                              const color = getTagColor(tag, projectTags);
                                              return (
                                                <button
                                                  key={tag}
                                                  type="button"
                                                  onMouseDown={(e) => {
                                                    e.preventDefault();
                                                    const cur = task.tags ?? [];
                                                    if (!cur.includes(tag)) void patchTask(task, { tags: [...cur, tag] });
                                                    setTagInputTaskId(null);
                                                    setTagInputValue("");
                                                  }}
                                                  className={[
                                                    "rounded-full border px-2 py-0.5 text-[10px] font-medium transition hover:opacity-100 opacity-80",
                                                    color.bg, color.text, color.border,
                                                  ].join(" ")}
                                                >
                                                  {tag}
                                                </button>
                                              );
                                            })}
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
                              <div className="flex w-full min-w-0 flex-wrap items-center gap-2 lg:min-w-[220px] lg:flex-nowrap lg:justify-start lg:pl-4">
                                <ProjectTaskPriorityButton
                                  value={task.priority ?? "medium"}
                                  disabled={completing || savingLocal}
                                  onPick={(pr) => void patchTask(task, { priority: pr })}
                                />
                                {task.dueAt ? (
                                  <span
                                    className="rounded-lg border border-[var(--line)] bg-[var(--card)] px-2 py-1 text-[10px] text-[var(--muted-strong)]"
                                    title={`截止：${formatDueInput(task.dueAt)}（北京时间显示）`}
                                  >
                                    截止 {formatDueInput(task.dueAt)}
                                  </span>
                                ) : null}
                                <button
                                  type="button"
                                  title="关联信源"
                                  disabled={completing || savingLocal}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void openTaskSourcePicker(task.id);
                                  }}
                                  className="relative inline-flex shrink-0 rounded-md p-1 text-[var(--muted-strong)] transition hover:bg-[var(--surface)] hover:text-[var(--foreground)] disabled:pointer-events-none disabled:opacity-40"
                                >
                                  <svg
                                    width="14"
                                    height="14"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    aria-hidden
                                  >
                                    <path d="M10 13a5 5 0 0 1 0-7l1-1a5 5 0 0 1 7.07 7.07L14 13" />
                                    <path d="M14 11a5 5 0 0 1 0 7l-1 1a5 5 0 0 1-7.07-7.07L10 11" />
                                  </svg>
                                  {(linksByTaskId[task.id]?.length ?? 0) > 0 ? (
                                    <span className="absolute -right-1 -top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-[var(--foreground)] px-0.5 text-[8px] font-bold leading-none text-[var(--background)] tabular-nums">
                                      {(linksByTaskId[task.id]!.length) > 9 ? "9+" : linksByTaskId[task.id]!.length}
                                    </span>
                                  ) : null}
                                </button>
                                <ProjectDuePicker
                                  task={task}
                                  disabled={!selectedId || completing || savingLocal}
                                  onSaveDue={(iso) => saveDueAndSync(task, iso)}
                                />
                                {task.syncedAt ? (
                                  <button
                                    type="button"
                                    onClick={() => void syncOne(task)}
                                    disabled={syncingTaskId === task.id || completing || savingLocal}
                                    className="shrink-0 border-0 bg-transparent px-0 py-0 text-[10px] font-medium text-emerald-700 underline-offset-2 hover:underline disabled:opacity-50 dark:text-emerald-400"
                                    title={needsResync ? TITLE_TICK_SYNCED_RESEND : TITLE_TICK_SYNCED}
                                  >
                                    {syncingTaskId === task.id ? "…" : "已同步滴答"}
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => void syncOne(task)}
                                    disabled={syncingTaskId === task.id || completing || savingLocal}
                                    className="shrink-0 border-0 bg-transparent px-0 py-0 text-[11px] text-emerald-700 underline-offset-2 hover:underline disabled:opacity-50 dark:text-emerald-400"
                                    title={TITLE_TICK_UNSYNCED}
                                  >
                                    {syncingTaskId === task.id ? "…" : "同步滴答"}
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => void removeTask(task)}
                                  disabled={completing}
                                  className="rounded-md p-1 text-[var(--muted)] transition hover:bg-rose-500/10 hover:text-rose-500 disabled:opacity-50"
                                  title={savingLocal ? "取消未保存的任务" : "删除"}
                                >
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                    <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14Z" />
                                    <path d="M10 11v6M14 11v6" />
                                  </svg>
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <p className="border-t border-[var(--line)] px-3 py-2 text-[10px] text-[var(--muted)]">
              滴答同步依赖「设置 → 滴答清单」中的 SMTP 与收件邮箱，与待办投递一致。
            </p>
          </>
        )}
      </section>
      </div>
      {projectMenuOpenId &&
        projectMenuAnchor &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            data-project-menu-portal
            className="fixed z-[9999] w-36 rounded-xl border border-[var(--line)] bg-[var(--card)] p-1 shadow-xl"
            style={{ left: projectMenuAnchor.left, top: projectMenuAnchor.bottom + 4 }}
          >
            <button
              type="button"
              onClick={() => {
                const proj = projects.find((p) => p.id === projectMenuOpenId);
                if (proj) {
                  setRenameValue(proj.name);
                  setRenamingProjectId(proj.id);
                }
                setProjectMenuOpenId(null);
              }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[13px] text-[var(--foreground)] hover:bg-[var(--surface)]"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5Z" />
              </svg>
              修改名称
            </button>
            <div className="my-0.5 h-px bg-[var(--line)]" />
            <button
              type="button"
              onClick={() => {
                setProjectMenuOpenId(null);
                void deleteProject();
              }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[13px] text-rose-600 hover:bg-rose-500/10 dark:text-rose-400"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14Z" />
              </svg>
              删除项目
            </button>
          </div>,
          document.body,
        )}

      {linkPickerTaskId &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="modal-overlay z-[60]"
            onClick={(e) => {
              if (e.target === e.currentTarget) setLinkPickerTaskId(null);
            }}
          >
            <div
              className="mx-4 w-full max-w-4xl rounded-2xl border border-[var(--line)] bg-[var(--background)] p-5 shadow-2xl sm:mx-6 sm:max-w-5xl sm:p-7"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-semibold text-[var(--foreground)]">任务关联信源</h3>
              <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
                勾选一条或多条资料与该任务关联；保存时尚未标为信源的资料会自动标为信源。
              </p>
              <div className="mt-4">
                <input
                  type="search"
                  value={sourceSearchQuery}
                  onChange={(e) => setSourceSearchQuery(e.target.value)}
                  placeholder="搜索标题或来源…"
                  className="input-focus-bar w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2.5 text-sm outline-none"
                  autoComplete="off"
                />
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 border-b border-[var(--line)] pb-2">
                <button
                  type="button"
                  disabled={pickLoading || filteredPickCandidates.length === 0}
                  onClick={() => {
                    const add = filteredPickCandidates.map((c) => c.id);
                    setPickedRecordIds((prev) => [...new Set([...prev, ...add])]);
                  }}
                  className="text-[11px] text-[var(--muted-strong)] underline-offset-2 hover:underline disabled:opacity-40"
                >
                  全选当前列表
                </button>
                <span className="text-[var(--line)]">·</span>
                <button
                  type="button"
                  disabled={pickLoading || filteredPickCandidates.length === 0}
                  onClick={() => {
                    const drop = new Set(filteredPickCandidates.map((c) => c.id));
                    setPickedRecordIds((prev) => prev.filter((id) => !drop.has(id)));
                  }}
                  className="text-[11px] text-[var(--muted-strong)] underline-offset-2 hover:underline disabled:opacity-40"
                >
                  取消当前列表所选
                </button>
                <span className="ml-auto text-[11px] tabular-nums text-[var(--muted)]">
                  已选 {pickedRecordIds.length} 条 · 当前显示 {filteredPickCandidates.length} / 共 {pickCandidates.length}
                </span>
              </div>
              <div className="mt-2 max-h-[min(60vh,480px)] overflow-y-auto rounded-lg border border-[var(--line)] bg-[var(--card)] p-1">
                {pickLoading ? (
                  <div className="flex flex-col items-center justify-center gap-3 py-10">
                    <span className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--muted)] border-t-[var(--foreground)]" aria-hidden />
                    <p className="text-center text-xs text-[var(--muted)]">加载可关联资料…</p>
                  </div>
                ) : pickCandidates.length === 0 ? (
                  <p className="px-3 py-8 text-center text-xs leading-relaxed text-[var(--muted)]">
                    暂无资料。请先通过「新建记录」添加，或从历史中查看。
                  </p>
                ) : filteredPickCandidates.length === 0 ? (
                  <p className="px-3 py-8 text-center text-xs text-[var(--muted)]">没有匹配「{sourceSearchQuery.trim()}」的资料，请换个关键词。</p>
                ) : (
                  <ul className="space-y-0.5">
                    {filteredPickCandidates.map((c) => {
                      const checked = pickedRecordIds.includes(c.id);
                      return (
                        <li key={c.id}>
                          <label className="flex cursor-pointer items-start gap-2.5 rounded-md px-2 py-2 text-left transition hover:bg-[var(--surface)]">
                            <input
                              type="checkbox"
                              className="mt-0.5 h-4 w-4 shrink-0 rounded border-[var(--line)]"
                              checked={checked}
                              onChange={() => {
                                setPickedRecordIds((prev) =>
                                  prev.includes(c.id)
                                    ? prev.filter((x) => x !== c.id)
                                    : [...prev, c.id],
                                );
                              }}
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block text-[13px] font-medium leading-snug text-[var(--foreground)]">
                                {c.title || "未命名"}
                              </span>
                              {c.sourceLabel ? (
                                <span className="mt-0.5 block text-[11px] text-[var(--muted)]">{c.sourceLabel}</span>
                              ) : null}
                              {!c.confirmedAt ? (
                                <span className="mt-0.5 block text-[10px] text-amber-700/90 dark:text-amber-400/90">
                                  保存后将自动标为历史信源
                                </span>
                              ) : null}
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                <Link
                  href="/?tab=record"
                  className="rounded-lg px-3 py-2 text-sm text-[var(--muted-strong)] hover:bg-[var(--surface)]"
                  onClick={() => setLinkPickerTaskId(null)}
                >
                  新建记录
                </Link>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={sourceSaveLoading}
                    onClick={() => setLinkPickerTaskId(null)}
                    className="rounded-lg px-4 py-2 text-sm text-[var(--muted-strong)] hover:bg-[var(--surface)] disabled:opacity-50"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    disabled={sourceSaveLoading || pickLoading}
                    onClick={() => void saveTaskSourceSelection()}
                    className="rounded-lg bg-[var(--foreground)] px-4 py-2 text-sm font-medium text-[var(--background)] hover:opacity-90 disabled:opacity-50"
                  >
                    {sourceSaveLoading ? "保存中…" : "保存关联"}
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {detailTask &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="modal-overlay z-[55]"
            onClick={(e) => {
              if (e.target === e.currentTarget) setDetailTaskId(null);
            }}
          >
            <div
              className="mx-4 max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-[var(--line)] bg-[var(--background)] p-6 shadow-2xl sm:mx-8 sm:max-w-4xl sm:p-8"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--line)] pb-4">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted)]">任务详情</p>
                  <p className="mt-1 text-xs text-[var(--muted-strong)]">项目 · {selected?.name ?? "—"}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setDetailTaskId(null)}
                  className="rounded-lg p-1.5 text-[var(--muted)] hover:bg-[var(--surface)]"
                  aria-label="关闭"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <p className="mt-4 whitespace-pre-wrap text-base font-semibold leading-relaxed text-[var(--foreground)] sm:text-lg">
                {detailTask.content}
              </p>
              <dl className="mt-6 grid gap-3 text-sm sm:grid-cols-2">
                <div className="rounded-lg bg-[var(--surface)] px-3 py-2">
                  <dt className="text-[10px] font-medium uppercase tracking-wide text-[var(--muted)]">优先级</dt>
                  <dd className="mt-0.5">
                    <span
                      className={[
                        "inline-flex rounded-md px-2 py-0.5 text-xs font-medium",
                        priorityConfig[detailTask.priority ?? "medium"].bg,
                      ].join(" ")}
                    >
                      {priorityConfig[detailTask.priority ?? "medium"].label}
                    </span>
                  </dd>
                </div>
                <div className="rounded-lg bg-[var(--surface)] px-3 py-2">
                  <dt className="text-[10px] font-medium uppercase tracking-wide text-[var(--muted)]">截止时间</dt>
                  <dd className="mt-0.5 text-[var(--foreground)]">
                    {detailTask.dueAt ? formatDueInput(detailTask.dueAt) : "未设置"}
                  </dd>
                </div>
                <div className="rounded-lg bg-[var(--surface)] px-3 py-2">
                  <dt className="text-[10px] font-medium uppercase tracking-wide text-[var(--muted)]">创建时间</dt>
                  <dd className="mt-0.5 text-[var(--foreground)]">{formatDateTime(detailTask.createdAt)}</dd>
                </div>
                {detailTask.status === "done" ? (
                  <div className="rounded-lg bg-[var(--surface)] px-3 py-2">
                    <dt className="text-[10px] font-medium uppercase tracking-wide text-[var(--muted)]">完成时间</dt>
                    <dd className="mt-0.5 text-[var(--foreground)]">
                      {formatDueInput(detailTask.completedAt || detailTask.updatedAt)}
                    </dd>
                  </div>
                ) : null}
                <div className="rounded-lg bg-[var(--surface)] px-3 py-2 sm:col-span-2">
                  <dt className="text-[10px] font-medium uppercase tracking-wide text-[var(--muted)]">滴答清单</dt>
                  <dd className="mt-0.5 text-[var(--foreground)]">
                    {detailTask.syncedAt ? `已同步 · ${formatDateTime(detailTask.syncedAt)}` : "尚未同步"}
                  </dd>
                </div>
              </dl>

              <div className="mt-8">
                <h4 className="text-sm font-semibold text-[var(--foreground)]">关联信源</h4>
                {taskLinksLoading ? (
                  <div className="mt-3 flex items-center gap-2.5 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-4 text-xs text-[var(--muted)]">
                    <span className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-[var(--muted)] border-t-[var(--foreground)]" aria-hidden />
                    <span>正在加载关联资料…</span>
                  </div>
                ) : (linksByTaskId[detailTask.id] ?? []).length === 0 ? (
                  <p className="mt-2 text-xs text-[var(--muted)]">暂未关联资料，可在下方「管理关联信源」中添加。</p>
                ) : (
                  <ul className="mt-3 space-y-2">
                    {(linksByTaskId[detailTask.id] ?? []).map((row) => (
                      <li
                        key={row.linkId}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--line)] bg-[var(--card)] px-3 py-2.5"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-[var(--foreground)]">{row.title || "未命名"}</p>
                          {row.sourceLabel ? (
                            <p className="mt-0.5 text-[11px] text-[var(--muted)]">{row.sourceLabel}</p>
                          ) : null}
                        </div>
                        <Link
                          href={`/?tab=history&record=${encodeURIComponent(row.recordId)}`}
                          onClick={() => setDetailTaskId(null)}
                          className="shrink-0 rounded-lg border border-[var(--line)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--foreground)] hover:bg-[var(--surface)]"
                        >
                          查看原信息
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="mt-8 flex flex-wrap gap-2 border-t border-[var(--line)] pt-5">
                <button
                  type="button"
                  onClick={() => {
                    const tid = detailTask.id;
                    setDetailTaskId(null);
                    void openTaskSourcePicker(tid);
                  }}
                  className="rounded-lg bg-[var(--foreground)] px-4 py-2 text-sm font-medium text-[var(--background)] hover:opacity-90"
                >
                  管理关联信源
                </button>
                <Link
                  href="/?tab=record"
                  className="rounded-lg border border-[var(--line)] px-4 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--surface)]"
                  onClick={() => setDetailTaskId(null)}
                >
                  新建记录
                </Link>
                <button
                  type="button"
                  onClick={() => setDetailTaskId(null)}
                  className="rounded-lg px-4 py-2 text-sm text-[var(--muted-strong)] hover:bg-[var(--surface)]"
                >
                  关闭
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

/** 与待办卡片优先级按钮一致：彩色标签 + Portal 下拉 */
function ProjectTaskPriorityButton({
  value,
  disabled,
  onPick,
}: {
  value: TodoPriority;
  disabled?: boolean;
  onPick: (p: TodoPriority) => void;
}) {
  const p = value in priorityConfig ? value : "medium";
  const pc = priorityConfig[p];
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  const updateRect = useCallback(() => {
    if (btnRef.current) setAnchor(btnRef.current.getBoundingClientRect());
  }, []);

  useEffect(() => {
    if (!open) return;
    updateRect();
    const onScrollOrResize = () => updateRect();
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [open, updateRect]);

  useEffect(() => {
    if (!open) return;
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onCapture = (e: MouseEvent) => {
      const target = e.target as Node;
      if (btnRef.current?.contains(target)) return;
      if ((e.target as Element).closest?.("[data-project-priority-portal]")) return;
      setOpen(false);
    };
    document.addEventListener("keydown", onEscape);
    document.addEventListener("mousedown", onCapture, true);
    return () => {
      document.removeEventListener("keydown", onEscape);
      document.removeEventListener("mousedown", onCapture, true);
    };
  }, [open]);

  return (
    <div className="relative inline-flex shrink-0">
      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          if (!disabled) setOpen((v) => !v);
        }}
        title={`优先级：${pc.label}`}
        className={[
          "inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition disabled:opacity-50",
          pc.bg,
        ].join(" ")}
      >
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-60" />
        {pc.label}
      </button>
      {open &&
        anchor &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            data-project-priority-portal
            className="fixed z-[9999] w-28 rounded-lg border border-[var(--line)] bg-[var(--card)] p-1 shadow-lg"
            style={{ left: anchor.left, top: anchor.bottom + 4 }}
            onClick={(e) => e.stopPropagation()}
          >
            {priorities.map((pr) => (
              <button
                key={pr}
                type="button"
                onClick={() => {
                  onPick(pr);
                  setOpen(false);
                }}
                className={[
                  "flex w-full items-center justify-between rounded-md px-2 py-1 text-[11px] transition",
                  p === pr ? priorityConfig[pr].bg : "text-[var(--muted-strong)] hover:bg-[var(--surface)]",
                ].join(" ")}
              >
                <span>{priorityConfig[pr].label}</span>
                {p === pr && (
                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden>
                    <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}

function ProjectDuePicker({
  task,
  disabled,
  onSaveDue,
}: {
  task: ProjectTask;
  disabled?: boolean;
  onSaveDue: (iso: string | null) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const getDefaultValues = () => {
    const base = task.dueAt ? new Date(task.dueAt) : new Date();
    return {
      date: `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, "0")}-${String(base.getDate()).padStart(2, "0")}`,
      time: `${String(base.getHours()).padStart(2, "0")}:${String(base.getMinutes()).padStart(2, "0")}`,
    };
  };
  const [dateVal, setDateVal] = useState(getDefaultValues().date);
  const [timeVal, setTimeVal] = useState(getDefaultValues().time);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const def = getDefaultValues();
    setDateVal(def.date);
    setTimeVal(def.time);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [open]);

  const confirm = async () => {
    if (disabled || saving) return;
    setSaving(true);
    try {
      const [y, m, d] = dateVal.split("-").map(Number);
      const [hh, mm] = timeVal.split(":").map(Number);
      const dt = new Date(y, m - 1, d, hh, mm, 0);
      if (!Number.isNaN(dt.getTime())) {
        await onSaveDue(dt.toISOString());
        setOpen(false);
      }
    } finally {
      setSaving(false);
    }
  };

  const clear = async () => {
    if (disabled || saving) return;
    setSaving(true);
    try {
      await onSaveDue(null);
      setOpen(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (!disabled) setOpen(true);
        }}
        disabled={disabled}
        className="inline-flex shrink-0 items-center justify-center rounded-md p-1 text-[var(--muted-strong)] transition hover:bg-[var(--surface)] hover:text-[var(--foreground)] disabled:opacity-50"
        title="设定提醒"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 3" />
        </svg>
      </button>
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="modal-overlay"
            onClick={(e) => {
              if (e.target === e.currentTarget) setOpen(false);
            }}
          >
            <div
              className="mx-4 w-full max-w-sm rounded-2xl border border-[var(--line)] bg-[var(--background)] p-6 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="mb-4 text-lg font-bold text-[var(--foreground)]">设定提醒时间</h3>
              <p className="mb-3 text-xs text-[var(--muted)]">选择日期和时刻，将保存为任务的截止时间（同步滴答时会写入邮件正文）</p>
              <div className="flex gap-3 pb-1">
                <input
                  type="date"
                  value={dateVal}
                  onChange={(e) => setDateVal(e.target.value)}
                  className="flex-1 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--foreground)] focus:border-[var(--foreground)] focus:outline-none"
                />
                <input
                  type="time"
                  value={timeVal}
                  onChange={(e) => setTimeVal(e.target.value)}
                  step="60"
                  className="w-28 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--foreground)] focus:border-[var(--foreground)] focus:outline-none"
                />
              </div>
              <div className="mt-6 flex justify-between gap-2">
                <button
                  type="button"
                  onClick={clear}
                  disabled={saving || !task.dueAt}
                  className="rounded-lg border border-[var(--line)] px-4 py-2 text-sm text-[var(--muted-strong)] hover:bg-[var(--surface)] disabled:opacity-50"
                >
                  清空
                </button>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="rounded-lg px-4 py-2 text-sm text-[var(--muted)] hover:bg-[var(--surface)]"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    onClick={confirm}
                    disabled={saving}
                    className="rounded-lg bg-[var(--foreground)] px-4 py-2 text-sm font-medium text-[var(--background)] transition hover:opacity-90 disabled:opacity-50"
                  >
                    {saving ? "保存中..." : "确定"}
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
