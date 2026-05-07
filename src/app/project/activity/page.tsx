"use client";

import { useEffect, useMemo, useState } from "react";

import { useActiveDesktopProject } from "@/hooks/use-active-desktop-project";
import type { P2PPeer, P2PStatus, RepoInspection, RepoStatusFile } from "@/lib/electron";

type ActivityEvent = {
  id: string;
  type: "build" | "review" | "comment" | "status" | "deploy" | "join" | "sync";
  title: string;
  description: string;
  actor: string;
  actorInitials: string;
  time: string;
  relatedFile?: string;
};

type ActivityType = ActivityEvent["type"];

const eventIcons: Record<ActivityEvent["type"], React.ReactNode> = {
  build: (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-emerald-500">
      <path fillRule="evenodd" d="M14.5 10a4.5 4.5 0 004.284-5.882c-.105-.324-.51-.391-.752-.15L15.34 6.66a.454.454 0 01-.493.101 3.046 3.046 0 01-1.608-1.607.454.454 0 01.1-.493l2.693-2.692c.24-.241.174-.647-.15-.752a4.5 4.5 0 00-5.873 4.575c.055.873-.128 1.808-.8 2.368l-7.23 6.024a2.724 2.724 0 103.837 3.837l6.024-7.23c.56-.672 1.495-.855 2.368-.8.18.012.362.018.547.018zM3 16.75a.75.75 0 100-1.5.75.75 0 000 1.5z" clipRule="evenodd" />
    </svg>
  ),
  review: (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-amber-500">
      <path d="M10 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" />
      <path fillRule="evenodd" d="M.664 10.59a1.651 1.651 0 010-1.186A10.004 10.004 0 0110 3c4.257 0 7.893 2.66 9.336 6.41.147.381.146.804 0 1.186A10.004 10.004 0 0110 17c-4.257 0-7.893-2.66-9.336-6.41zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
    </svg>
  ),
  comment: (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-sky-500">
      <path fillRule="evenodd" d="M10 2c-2.236 0-4.43.18-6.57.524C1.993 2.755 1 4.014 1 5.426v5.148c0 1.413.993 2.67 2.43 2.902 1.168.188 2.352.327 3.55.414.28.02.521.18.642.413l1.713 3.293a.75.75 0 001.33 0l1.713-3.293a.783.783 0 01.642-.413 41.102 41.102 0 003.55-.414c1.437-.231 2.43-1.49 2.43-2.902V5.426c0-1.413-.993-2.67-2.43-2.902A41.289 41.289 0 0010 2zM6.75 6a.75.75 0 000 1.5h6.5a.75.75 0 000-1.5h-6.5zm0 2.5a.75.75 0 000 1.5h3.5a.75.75 0 000-1.5h-3.5z" clipRule="evenodd" />
    </svg>
  ),
  status: (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-violet-500">
      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
    </svg>
  ),
  deploy: (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-rose-500">
      <path fillRule="evenodd" d="M10 1a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0v-1.5A.75.75 0 0110 1zM5.05 3.05a.75.75 0 011.06 0l1.062 1.06A.75.75 0 116.11 5.173L5.05 4.11a.75.75 0 010-1.06zm9.9 0a.75.75 0 010 1.06l-1.06 1.062a.75.75 0 01-1.062-1.061l1.061-1.06a.75.75 0 011.06 0zM3 8a.75.75 0 01.75-.75h1.5a.75.75 0 010 1.5h-1.5A.75.75 0 013 8zm11 0a.75.75 0 01.75-.75h1.5a.75.75 0 010 1.5h-1.5A.75.75 0 0114 8zm-6.828 2.828a.75.75 0 010 1.061L6.11 12.95a.75.75 0 01-1.06-1.06l1.06-1.06a.75.75 0 011.06 0zm3.594-3.317a.75.75 0 00-1.37.364l-.492 6.861a.75.75 0 001.204.65l1.043-.723.992 1.716a.75.75 0 001.071.25l.944-.545a.75.75 0 00.25-1.072l-.992-1.716 1.262-.163a.75.75 0 00.166-1.452l-4.078-2.17z" clipRule="evenodd" />
    </svg>
  ),
  join: (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-teal-500">
      <path d="M10 8a3 3 0 100-6 3 3 0 000 6zM3.465 14.493a1.23 1.23 0 00.41 1.412A9.957 9.957 0 0010 18c2.31 0 4.438-.784 6.131-2.1.43-.333.604-.903.408-1.41a7.002 7.002 0 00-13.074.003z" />
    </svg>
  ),
  sync: (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-cyan-500">
      <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.387-.387H7.25a.75.75 0 000-1.5H3.75a.75.75 0 00-.75.75v3.5a.75.75 0 001.5 0v-1.689l.55.55a7 7 0 0011.713-3.14.75.75 0 00-1.451-.55zM4.688 8.576a5.5 5.5 0 019.201-2.466l.387.387H12.75a.75.75 0 000 1.5h3.5a.75.75 0 00.75-.75v-3.5a.75.75 0 00-1.5 0v1.689l-.55-.55A7 7 0 003.237 8.026a.75.75 0 001.451.55z" clipRule="evenodd" />
    </svg>
  ),
};

const categoryLabels: Record<ActivityEvent["type"], string> = {
  build: "Builds",
  review: "Reviews",
  comment: "Comments",
  status: "Status changes",
  deploy: "Deploys",
  join: "Team",
  sync: "Sync",
};

const categoryColors: Record<ActivityEvent["type"], string> = {
  build: "bg-emerald-100 text-emerald-700",
  review: "bg-amber-100 text-amber-700",
  comment: "bg-sky-100 text-sky-700",
  status: "bg-violet-100 text-violet-700",
  deploy: "bg-rose-100 text-rose-700",
  join: "bg-teal-100 text-teal-700",
  sync: "bg-cyan-100 text-cyan-700",
};

function EventRow({ event }: { event: ActivityEvent }) {
  return (
    <div className="flex gap-3 py-2.5">
      <div className="app-surface-strong flex h-7 w-7 shrink-0 items-center justify-center rounded-full">
        {eventIcons[event.type]}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium theme-fg">{event.title}</p>
        <p className="mt-0.5 text-[12px] theme-soft">{event.description}</p>
        {event.relatedFile && (
          <p className="mt-1 flex items-center gap-1.5 text-[11px] theme-muted">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
              <path d="M3 3.5A1.5 1.5 0 014.5 2h6.879a1.5 1.5 0 011.06.44l1.122 1.12A1.5 1.5 0 0114 4.622V12.5a1.5 1.5 0 01-1.5 1.5h-9A1.5 1.5 0 012 12.5v-9z" />
            </svg>
            {event.relatedFile}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <div className="app-avatar flex h-5 w-5 items-center justify-center rounded-full text-[8px] font-bold">
          {event.actorInitials}
        </div>
        <span className="text-[11px] theme-muted">{event.time}</span>
      </div>
    </div>
  );
}

type ViewMode = "categories" | "all";
type FeedFocus = "all" | "attention" | "sync";

type QueueItem = {
  id: string;
  title: string;
  description: string;
  kind: "approval" | "active" | "sync";
  since: number;
};

type FileWatcherStatus = {
  watching: boolean;
  repoPath: string | null;
  projectId: string | null;
  paused: boolean;
  syncing: boolean;
};

type SyncResult = {
  success: boolean;
  label: string;
  detail: string;
  at: number;
};

type MetricTone = "neutral" | "good" | "busy" | "warn";
type ActionTone = "neutral" | "good" | "warn";
type ActionBusy = "retry-sync" | "inspect" | "terminal" | "approve" | "deny" | "cancel-agent" | "reset-agent" | null;

type PendingApproval = {
  id?: string;
  toolName?: string;
  summary?: string;
  requestedAt?: number;
  toolInput?: Record<string, unknown>;
  projectId?: string;
  scope?: string;
};

type ActiveRequest = {
  active?: boolean;
  projectId?: string;
  taskId?: string;
  taskName?: string;
  threadId?: string;
  scope?: string;
  requestId?: string;
  output?: string;
  prompt?: string;
  promptText?: string;
  startedAt?: number;
  sessionId?: string;
  sessionTitle?: string;
};

type ActionNotice = {
  tone: ActionTone;
  title: string;
  detail: string;
};

const metricToneStyles: Record<MetricTone, string> = {
  neutral: "bg-black/[0.04] text-text-dim dark:bg-white/[0.06]",
  good: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  busy: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
  warn: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
};

const actionNoticeStyles: Record<ActionTone, string> = {
  neutral: "border-black/[0.06] bg-black/[0.02] theme-muted dark:border-white/[0.08] dark:bg-white/[0.04]",
  good: "border-emerald-500/20 bg-emerald-50/80 text-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-100",
  warn: "border-amber-500/20 bg-amber-50/80 text-amber-950 dark:bg-amber-500/10 dark:text-amber-100",
};

function formatAgo(ts: number): string {
  const diff = Math.max(0, Date.now() - ts);
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

function plural(value: number, singular: string, pluralLabel = `${singular}s`) {
  return `${value} ${value === 1 ? singular : pluralLabel}`;
}

function isAttentionEvent(event: ActivityEvent) {
  const haystack = `${event.title} ${event.description}`.toLowerCase();
  return ["failed", "failure", "error", "blocked", "conflict", "cancelled", "denied", "unavailable"].some((term) => haystack.includes(term));
}

function shortPath(path: string | null | undefined) {
  if (!path) return null;
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts.at(-1) ?? path;
}

function shortErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "Unknown error.");
  const firstLine = message.split("\n")[0]?.trim() || "Unknown error.";
  return firstLine.length > 180 ? `${firstLine.slice(0, 177)}...` : firstLine;
}

function formatFileStatus(file: RepoStatusFile) {
  const status = `${file.indexStatus || " "}${file.workTreeStatus || " "}`;
  if (status.includes("U")) return "Conflict";
  if (status.includes("?")) return "New";
  if (status.includes("A")) return "Added";
  if (status.includes("D")) return "Deleted";
  if (status.includes("R")) return "Renamed";
  if (status.includes("M")) return "Modified";
  return status.trim() || "Changed";
}

function ActionButton({
  children,
  disabled,
  onClick,
  tone = "neutral",
}: {
  children: React.ReactNode;
  disabled?: boolean;
  onClick: () => void;
  tone?: ActionTone;
}) {
  const toneClass = tone === "good"
    ? "bg-emerald-500/12 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-300"
    : tone === "warn"
      ? "bg-amber-500/15 text-amber-800 hover:bg-amber-500/25 dark:text-amber-200"
      : "bg-black/[0.04] theme-fg hover:bg-black/[0.07] dark:bg-white/[0.06] dark:hover:bg-white/[0.1]";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex min-h-8 items-center justify-center rounded-lg px-3 py-1.5 text-[12px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${toneClass}`}
    >
      {children}
    </button>
  );
}

function MetricPanel({
  label,
  value,
  detail,
  tone = "neutral",
  footer,
}: {
  label: string;
  value: string | number;
  detail: string;
  tone?: MetricTone;
  footer?: string;
}) {
  return (
    <section className="app-surface rounded-xl px-4 py-3.5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] theme-muted">{label}</p>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${metricToneStyles[tone]}`}>
          {tone === "good" ? "OK" : tone === "busy" ? "Live" : tone === "warn" ? "Watch" : "Info"}
        </span>
      </div>
      <p className="mt-3 font-display text-[28px] font-bold leading-none theme-fg">{value}</p>
      <p className="mt-2 min-h-[32px] text-[12px] leading-relaxed theme-soft">{detail}</p>
      {footer && <p className="mt-2 truncate text-[11px] theme-muted">{footer}</p>}
    </section>
  );
}

export default function ActivityPage() {
  const { activeProject } = useActiveDesktopProject();
  const [viewMode, setViewMode] = useState<ViewMode>("categories");
  const [feedFocus, setFeedFocus] = useState<FeedFocus>("all");
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());
  const [personFilter, setPersonFilter] = useState<string | null>(null);
  const [desktopEvents, setDesktopEvents] = useState<ActivityEvent[]>([]);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [watcherStatus, setWatcherStatus] = useState<FileWatcherStatus | null>(null);
  const [p2pStatus, setP2pStatus] = useState<P2PStatus | null>(null);
  const [p2pPeers, setP2pPeers] = useState<P2PPeer[]>([]);
  const [lastSyncResult, setLastSyncResult] = useState<SyncResult | null>(null);
  const [repoInspection, setRepoInspection] = useState<RepoInspection | null>(null);
  const [actionNotice, setActionNotice] = useState<ActionNotice | null>(null);
  const [actionBusy, setActionBusy] = useState<ActionBusy>(null);
  const [pendingApproval, setPendingApproval] = useState<PendingApproval | null>(null);
  const [activeRequest, setActiveRequest] = useState<ActiveRequest | null>(null);
  const [nowTick, setNowTick] = useState(0);

  useEffect(() => {
    if (!window.electronAPI?.activity) {
      return;
    }

    let cancelled = false;

    const hydrateEvents = async () => {
      const events = await window.electronAPI!.activity.list();
      if (!cancelled) {
        setDesktopEvents(events as ActivityEvent[]);
      }
    };

    void hydrateEvents();

    const stopListening = window.electronAPI.activity.onCreated((event) => {
      setDesktopEvents((current) => [event as ActivityEvent, ...current]);
    });

    return () => {
      cancelled = true;
      stopListening();
    };
  }, []);

  // ─── Queue polling (pending approvals + active agent requests) ───
  useEffect(() => {
    if (!window.electronAPI?.project) return;
    let cancelled = false;

    const refresh = async () => {
      const items: QueueItem[] = [];
      let nextApproval: PendingApproval | null = null;
      let nextActiveRequest: ActiveRequest | null = null;
      try {
        const pending = await window.electronAPI!.project.getPendingApproval?.();
        if (pending && typeof pending === "object") {
          const p = pending as PendingApproval;
          nextApproval = p;
          items.push({
            id: p.id ?? "approval",
            kind: "approval",
            title: "Waiting for your approval",
            description: p.summary ?? p.toolName ?? "An action is queued and needs your OK before it runs.",
            since: p.requestedAt ?? Date.now(),
          });
        }
      } catch { nextApproval = null; }
      try {
        const active = await window.electronAPI!.project.getActiveRequest?.();
        if (active && typeof active === "object") {
          const a = active as ActiveRequest;
          if (a.active !== false) {
            nextActiveRequest = a;
            const prompt = a.promptText ?? a.prompt ?? a.output ?? "";
            items.push({
              id: a.requestId ?? "active",
              kind: "active",
              title: a.scope === "pm-chat" ? "Planner is thinking…" : a.scope === "solo-chat" ? "Solo chat running…" : "Agent working…",
              description: prompt ? (prompt.length > 80 ? prompt.slice(0, 80) + "…" : prompt) : a.taskName ?? a.sessionTitle ?? "Request in flight.",
              since: a.startedAt ?? Date.now(),
            });
          }
        }
      } catch { nextActiveRequest = null; }
      if (!cancelled) {
        setPendingApproval(nextApproval);
        setActiveRequest(nextActiveRequest);
        setQueue((current) => [...current.filter((item) => item.kind === "sync"), ...items]);
      }
    };

    void refresh();
    const interval = setInterval(() => { void refresh(); setNowTick((n) => n + 1); }, 2000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);
  void nowTick;

  useEffect(() => {
    if (!window.electronAPI?.fileWatcher) return;

    let cancelled = false;

    const refresh = async () => {
      try {
        const status = await window.electronAPI!.fileWatcher.status();
        if (!cancelled) {
          setWatcherStatus(status as FileWatcherStatus);
        }
      } catch {
        if (!cancelled) {
          setWatcherStatus(null);
        }
      }
    };

    void refresh();
    const interval = setInterval(() => { void refresh(); }, 4000);
    const stopStatus = window.electronAPI.fileWatcher.onStatus((status) => {
      setWatcherStatus((current) => ({
        watching: status.watching,
        repoPath: status.repoPath,
        projectId: status.projectId ?? current?.projectId ?? null,
        paused: current?.paused ?? false,
        syncing: current?.syncing ?? false,
      }));
    });

    return () => {
      cancelled = true;
      clearInterval(interval);
      stopStatus();
    };
  }, []);

  useEffect(() => {
    if (!window.electronAPI?.p2p || !activeProject?.id) {
      setP2pStatus(null);
      setP2pPeers([]);
      return;
    }

    let cancelled = false;
    const projectId = activeProject.id;

    const refresh = async () => {
      try {
        const status = await window.electronAPI!.p2p.status({ projectId });
        if (cancelled) return;
        const scopedStatus = status as P2PStatus;
        setP2pStatus(scopedStatus);

        if (scopedStatus?.joined) {
          const peers = await window.electronAPI!.p2p.peers({ projectId });
          if (!cancelled) setP2pPeers(peers ?? []);
        } else {
          setP2pPeers([]);
        }
      } catch {
        if (!cancelled) {
          setP2pStatus(null);
          setP2pPeers([]);
        }
      }
    };

    void refresh();
    const interval = setInterval(() => { void refresh(); }, 5000);
    const unsubs = [
      window.electronAPI.p2p.onPresence((event) => {
        if (event.projectId && event.projectId !== projectId) return;
        setP2pPeers(event.peers ?? []);
        setP2pStatus((current) => current ? { ...current, joined: true, peerCount: event.memberCount } : current);
      }),
      window.electronAPI.p2p.onPeerJoined((event) => {
        if (event.projectId && event.projectId !== projectId) return;
        void refresh();
      }),
      window.electronAPI.p2p.onPeerLeft((event) => {
        if (event.projectId && event.projectId !== projectId) return;
        void refresh();
      }),
      window.electronAPI.p2p.onReconnecting((event) => {
        if (event.projectId && event.projectId !== projectId) return;
        setP2pStatus((current) => current ? { ...current, reconnecting: true, reconnectAttempts: event.attempt } : current);
      }),
    ];

    return () => {
      cancelled = true;
      clearInterval(interval);
      unsubs.forEach((unsubscribe) => unsubscribe?.());
    };
  }, [activeProject?.id]);

  // ─── Git/P2P sync queue visibility ───
  useEffect(() => {
    if (!window.electronAPI?.fileWatcher) return;

    const removeSyncItem = (id: string) => {
      setQueue((current) => current.filter((item) => item.id !== id));
    };

    const upsertSyncItem = (item: QueueItem) => {
      setQueue((current) => {
        const withoutExisting = current.filter((entry) => entry.id !== item.id);
        return [item, ...withoutExisting];
      });
    };

    const stopSyncStart = window.electronAPI.fileWatcher.onSyncStart((event) => {
      setWatcherStatus((current) => current ? { ...current, syncing: true } : current);
      upsertSyncItem({
        id: `sync:${event.repoPath}`,
        kind: "sync",
        title: "Publishing workspace changes",
        description: `Pushing updates to ${event.branch ?? "codebuddy-build"}.`,
        since: Date.now(),
      });
    });

    const stopSyncComplete = window.electronAPI.fileWatcher.onSyncComplete((event) => {
      setWatcherStatus((current) => current ? { ...current, syncing: false } : current);
      setLastSyncResult({
        success: event.success,
        label: event.success ? "Workspace published" : "Publish failed",
        detail: event.error ?? event.reason ?? event.commitMessage ?? (event.skipped ? "No local changes needed publishing." : "Workspace sync finished."),
        at: Date.now(),
      });
      removeSyncItem(`sync:${event.repoPath}`);
    });

    const stopPullStart = window.electronAPI.fileWatcher.onPullStart((event) => {
      setWatcherStatus((current) => current ? { ...current, syncing: true } : current);
      upsertSyncItem({
        id: `pull:${event.repoPath}`,
        kind: "sync",
        title: "Applying team changes",
        description: `Pulling latest updates from ${event.branch ?? "codebuddy-build"}.`,
        since: Date.now(),
      });
    });

    const stopPullComplete = window.electronAPI.fileWatcher.onPullComplete((event) => {
      setWatcherStatus((current) => current ? { ...current, syncing: false } : current);
      setLastSyncResult({
        success: event.success,
        label: event.success ? "Team changes applied" : "Pull failed",
        detail: event.error ?? event.message ?? "Team sync finished.",
        at: Date.now(),
      });
      removeSyncItem(`pull:${event.repoPath}`);
    });

    return () => {
      stopSyncStart();
      stopSyncComplete();
      stopPullStart();
      stopPullComplete();
    };
  }, []);

  const projectActivity = (activeProject?.dashboard.activity ?? []) as ActivityEvent[];
  const sourceFeed = desktopEvents.length > 0 ? desktopEvents : projectActivity;

  // Unique actors
  const actors = useMemo(() => Array.from(new Map(sourceFeed.map((e) => [e.actor, e.actorInitials]))), [sourceFeed]);

  // Filter by person first
  const personScoped = personFilter ? sourceFeed.filter((e) => e.actor === personFilter) : sourceFeed;
  const filtered = useMemo(() => {
    if (feedFocus === "attention") return personScoped.filter(isAttentionEvent);
    if (feedFocus === "sync") return personScoped.filter((event) => event.type === "sync");
    return personScoped;
  }, [feedFocus, personScoped]);

  const attentionEvents = useMemo(() => sourceFeed.filter(isAttentionEvent), [sourceFeed]);
  const syncEvents = useMemo(() => sourceFeed.filter((event) => event.type === "sync"), [sourceFeed]);
  const queueCounts = useMemo(() => ({
    approvals: queue.filter((item) => item.kind === "approval").length,
    active: queue.filter((item) => item.kind === "active").length,
    sync: queue.filter((item) => item.kind === "sync").length,
  }), [queue]);

  const categoryMix = useMemo(() => {
    const counts = sourceFeed.reduce<Record<ActivityType, number>>((acc, event) => {
      acc[event.type] = (acc[event.type] ?? 0) + 1;
      return acc;
    }, {} as Record<ActivityType, number>);
    return (Object.keys(categoryLabels) as ActivityType[])
      .map((type) => ({ type, count: counts[type] ?? 0 }))
      .filter((item) => item.count > 0)
      .sort((a, b) => b.count - a.count);
  }, [sourceFeed]);

  const latestAttention = attentionEvents[0];
  const latestEvent = sourceFeed[0];
  const latestSyncEvent = syncEvents[0];
  const syncQueueItem = queue.find((item) => item.kind === "sync");
  const syncHasProblem = lastSyncResult ? !lastSyncResult.success : latestSyncEvent ? isAttentionEvent(latestSyncEvent) : false;
  const syncTone: MetricTone = syncQueueItem || watcherStatus?.syncing
    ? "busy"
    : syncHasProblem
      ? "warn"
      : watcherStatus?.watching
        ? "good"
        : "neutral";
  const syncValue = syncQueueItem
    ? "Syncing"
    : watcherStatus?.paused
      ? "Paused"
      : watcherStatus?.watching
        ? "Watching"
        : "Idle";
  const syncDetail = syncQueueItem
    ? syncQueueItem.description
    : lastSyncResult
      ? `${lastSyncResult.label} ${formatAgo(lastSyncResult.at)}. ${lastSyncResult.detail}`
      : latestSyncEvent
        ? `${latestSyncEvent.title} (${latestSyncEvent.time}). ${latestSyncEvent.description}`
      : watcherStatus?.watching
        ? "File watcher is ready to publish local changes."
        : "No live workspace watcher is active yet.";
  const peerTone: MetricTone = p2pStatus?.reconnecting ? "warn" : p2pStatus?.joined ? "good" : "neutral";
  const peerValue = p2pStatus?.joined ? p2pPeers.length : "Off";
  const peerDetail = p2pStatus?.reconnecting
    ? `Reconnecting to the project mesh${p2pStatus.reconnectAttempts ? `, attempt ${p2pStatus.reconnectAttempts}` : ""}.`
    : p2pStatus?.joined
      ? p2pPeers.length > 0
        ? `${plural(p2pPeers.length, "peer")} connected: ${p2pPeers.map((peer) => peer.name).join(", ")}.`
        : "Shared project session is live, waiting for collaborators."
      : "No peer session is joined for this project.";
  const activityDetail = latestEvent
    ? `Latest: ${latestEvent.title} (${latestEvent.time}).`
    : "No activity has been recorded yet.";
  const activeWorkTone: MetricTone = queueCounts.approvals > 0 ? "warn" : queue.length > 0 ? "busy" : "good";
  const activeWorkDetail = queue.length === 0
    ? "No approvals, agent runs, or sync jobs are waiting."
    : [
        queueCounts.approvals ? plural(queueCounts.approvals, "approval") : null,
        queueCounts.active ? plural(queueCounts.active, "agent run") : null,
        queueCounts.sync ? plural(queueCounts.sync, "sync job") : null,
      ].filter(Boolean).join(", ") + " in progress.";
  const maxCategoryCount = Math.max(1, ...categoryMix.map((item) => item.count));
  const repoPath = watcherStatus?.repoPath ?? activeProject?.repoPath ?? null;
  const activeRequestLabel = activeRequest?.taskName ?? activeRequest?.sessionTitle ?? (
    activeRequest?.scope === "pm-chat" ? "Planner" : activeRequest?.scope === "solo-chat" ? "Solo chat" : "Agent"
  );
  const approvalLabel = pendingApproval?.summary ?? pendingApproval?.toolName ?? "Tool call";
  const changedFiles = repoInspection?.changedFiles ?? [];

  // Group by category
  const grouped = filtered.reduce<Record<string, ActivityEvent[]>>((acc, e) => {
    if (!acc[e.type]) acc[e.type] = [];
    acc[e.type].push(e);
    return acc;
  }, {});

  const toggleCat = (cat: string) => {
    setExpandedCats((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const handleRetrySync = async () => {
    if (!repoPath || !window.electronAPI?.fileWatcher) {
      setActionNotice({ tone: "warn", title: "Sync unavailable", detail: "No repository watcher is available for this project." });
      return;
    }

    setActionBusy("retry-sync");
    setActionNotice(null);
    try {
      if (!watcherStatus?.watching) {
        const started = await window.electronAPI.fileWatcher.start({ repoPath, projectId: activeProject?.id });
        if (!started?.watching || started.error) {
          throw new Error(started.error ?? "File watcher could not be started.");
        }
      }

      const result = await window.electronAPI.fileWatcher.triggerSync();
      if (result?.error) throw new Error(result.error);
      setActionNotice({ tone: "good", title: "Sync queued", detail: "CodeCollab is publishing the latest workspace state." });
    } catch (error) {
      setActionNotice({ tone: "warn", title: "Sync retry failed", detail: shortErrorMessage(error) });
    } finally {
      setActionBusy(null);
    }
  };

  const handleInspectRepo = async () => {
    if (!repoPath || !window.electronAPI?.repo) {
      setActionNotice({ tone: "warn", title: "Inspection unavailable", detail: "No repository path is available for inspection." });
      return;
    }

    setActionBusy("inspect");
    setActionNotice(null);
    try {
      const inspection = await window.electronAPI.repo.inspect(repoPath);
      setRepoInspection(inspection);
      setActionNotice({
        tone: inspection.changedFiles.length > 0 ? "neutral" : "good",
        title: inspection.changedFiles.length > 0 ? "Changes found" : "Working tree clean",
        detail: `${inspection.branch} has ${plural(inspection.changedFiles.length, "changed file")}.`,
      });
    } catch (error) {
      setActionNotice({ tone: "warn", title: "Inspection failed", detail: shortErrorMessage(error) });
    } finally {
      setActionBusy(null);
    }
  };

  const handleOpenTerminal = async () => {
    if (!repoPath || !window.electronAPI?.openTerminal) {
      setActionNotice({ tone: "warn", title: "Terminal unavailable", detail: "No repository path is available for a terminal session." });
      return;
    }

    setActionBusy("terminal");
    setActionNotice(null);
    try {
      const result = await window.electronAPI.openTerminal({
        cwd: repoPath,
        command: "git status --short --branch && git log --oneline -5",
        run: true,
      });
      if (!result?.ok) throw new Error(result?.error ?? "Could not open a terminal.");
      setActionNotice({ tone: "good", title: "Terminal opened", detail: "Repository status command is running in a new terminal window." });
    } catch (error) {
      setActionNotice({ tone: "warn", title: "Terminal failed", detail: shortErrorMessage(error) });
    } finally {
      setActionBusy(null);
    }
  };

  const handleApproval = async (approved: boolean) => {
    if (!window.electronAPI?.project?.approveToolCall) {
      setActionNotice({ tone: "warn", title: "Approval unavailable", detail: "The active tool approval channel is unavailable." });
      return;
    }

    setActionBusy(approved ? "approve" : "deny");
    setActionNotice(null);
    try {
      const result = await window.electronAPI.project.approveToolCall({ approved });
      if (!result?.success) throw new Error(result?.error ?? "The approval response could not be sent.");
      setPendingApproval(null);
      setActionNotice({
        tone: approved ? "good" : "neutral",
        title: approved ? "Approved" : "Denied",
        detail: `${approvalLabel} was ${approved ? "approved" : "denied"}.`,
      });
    } catch (error) {
      setActionNotice({ tone: "warn", title: "Approval failed", detail: shortErrorMessage(error) });
    } finally {
      setActionBusy(null);
    }
  };

  const handleCancelAgent = async () => {
    if (!window.electronAPI?.project?.cancelActiveRequest) {
      setActionNotice({ tone: "warn", title: "Cancel unavailable", detail: "The active agent channel is unavailable." });
      return;
    }

    setActionBusy("cancel-agent");
    setActionNotice(null);
    try {
      const result = await window.electronAPI.project.cancelActiveRequest();
      if (!result?.cancelled) throw new Error("No active request was cancelled.");
      setActiveRequest(null);
      setActionNotice({ tone: "good", title: "Agent stopped", detail: `${activeRequestLabel} was cancelled.` });
    } catch (error) {
      setActionNotice({ tone: "warn", title: "Cancel failed", detail: shortErrorMessage(error) });
    } finally {
      setActionBusy(null);
    }
  };

  const handleResetAgent = async () => {
    if (!window.electronAPI?.project?.forceResetAgent) {
      setActionNotice({ tone: "warn", title: "Reset unavailable", detail: "The agent reset channel is unavailable." });
      return;
    }

    setActionBusy("reset-agent");
    setActionNotice(null);
    try {
      const result = await window.electronAPI.project.forceResetAgent({ repoPath: repoPath ?? undefined });
      if (!result?.success) throw new Error("Agent state could not be reset.");
      setActiveRequest(null);
      setPendingApproval(null);
      setActionNotice({ tone: "good", title: "Agent reset", detail: "Cleared the active request and released the workspace sync lock." });
    } catch (error) {
      setActionNotice({ tone: "warn", title: "Reset failed", detail: shortErrorMessage(error) });
    } finally {
      setActionBusy(null);
    }
  };

  return (
    <div className="min-h-screen text-text">

      <div className="px-6 py-8 pb-32">
        {/* Header */}
        <div className="mb-6">
          <h1 className="font-display text-display-sm font-bold tracking-tight text-text">Activity</h1>
          <p className="mt-1 text-body-sm text-text-dim">
            {activeProject
              ? `Everything happening across ${activeProject.name}.`
              : "Open a real project to see its activity feed."}
          </p>
        </div>

        {/* Operational pulse */}
        <div className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <MetricPanel
            label="Active work"
            value={queue.length}
            detail={activeWorkDetail}
            tone={activeWorkTone}
            footer={queue[0] ? `${queue[0].title} · ${formatAgo(queue[0].since)}` : "Queue is clear"}
          />
          <MetricPanel
            label="Workspace sync"
            value={syncValue}
            detail={syncDetail}
            tone={syncTone}
            footer={shortPath(watcherStatus?.repoPath) ?? "No repository watcher"}
          />
          <MetricPanel
            label="Peers"
            value={peerValue}
            detail={peerDetail}
            tone={peerTone}
            footer={p2pStatus?.topic ? `Topic ${p2pStatus.topic.slice(0, 10)}...` : "Local project session"}
          />
          <MetricPanel
            label="Feed health"
            value={attentionEvents.length}
            detail={attentionEvents.length > 0 ? `${plural(attentionEvents.length, "event")} may need attention.` : activityDetail}
            tone={attentionEvents.length > 0 ? "warn" : "good"}
            footer={`${plural(sourceFeed.length, "event")} · ${plural(actors.length, "person", "people")}`}
          />
        </div>

        {latestAttention && (
          <div className="mb-4 flex flex-col gap-3 rounded-xl border border-amber-500/20 bg-amber-50/80 px-4 py-3 text-amber-950 dark:bg-amber-500/10 dark:text-amber-100 sm:flex-row sm:items-center">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.876c.673 1.167-.17 2.626-1.516 2.626H3.72c-1.347 0-2.19-1.459-1.516-2.626L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold">{latestAttention.title}</p>
              <p className="mt-0.5 truncate text-[12px] opacity-80">{latestAttention.description}</p>
            </div>
            <button
              type="button"
              onClick={() => {
                setFeedFocus("attention");
                setViewMode("all");
              }}
              className="shrink-0 rounded-lg bg-amber-500/15 px-3 py-1.5 text-[12px] font-semibold text-amber-800 transition hover:bg-amber-500/25 dark:text-amber-200"
            >
              Review
            </button>
          </div>
        )}

        {categoryMix.length > 0 && (
          <div className="mb-4 app-surface rounded-xl px-4 py-3">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-[13px] font-semibold theme-fg">Activity mix</p>
              <p className="text-[11px] theme-muted">{sourceFeed.length === filtered.length ? "Full feed" : `${filtered.length} shown`}</p>
            </div>
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
              {categoryMix.slice(0, 4).map((item) => (
                <div key={item.type} className="min-w-0">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-1.5 text-[12px] font-medium theme-soft">
                      {eventIcons[item.type]}
                      <span className="truncate">{categoryLabels[item.type]}</span>
                    </span>
                    <span className="text-[11px] theme-muted">{item.count}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-black/[0.06] dark:bg-white/[0.08]">
                    <div
                      className="h-full rounded-full bg-violet-500/70"
                      style={{ width: `${Math.max(12, Math.round((item.count / maxCategoryCount) * 100))}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mb-4 app-surface overflow-hidden rounded-xl">
          <div className="flex flex-wrap items-center gap-2 border-b border-black/[0.04] px-4 py-2.5 dark:border-white/[0.08]">
            <span className="text-[13px] font-semibold theme-fg">Recovery actions</span>
            <span className="rounded-full bg-black/[0.04] px-2 py-0.5 text-[11px] font-medium theme-muted dark:bg-white/[0.06]">
              {repoPath ? shortPath(repoPath) : "No repo"}
            </span>
            {pendingApproval && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
                Approval waiting
              </span>
            )}
            {activeRequest && (
              <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-medium text-violet-700 dark:bg-violet-500/15 dark:text-violet-300">
                Agent active
              </span>
            )}
          </div>

          <div className="grid gap-4 px-4 py-4 xl:grid-cols-[1fr_1.2fr]">
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <ActionButton onClick={() => { void handleRetrySync(); }} disabled={!repoPath || actionBusy !== null} tone="good">
                  {actionBusy === "retry-sync" ? "Retrying..." : "Retry sync"}
                </ActionButton>
                <ActionButton onClick={() => { void handleInspectRepo(); }} disabled={!repoPath || actionBusy !== null}>
                  {actionBusy === "inspect" ? "Inspecting..." : "Inspect changes"}
                </ActionButton>
                <ActionButton onClick={() => { void handleOpenTerminal(); }} disabled={!repoPath || actionBusy !== null}>
                  {actionBusy === "terminal" ? "Opening..." : "Open terminal"}
                </ActionButton>
                {activeRequest && (
                  <>
                    <ActionButton onClick={() => { void handleCancelAgent(); }} disabled={actionBusy !== null} tone="warn">
                      {actionBusy === "cancel-agent" ? "Stopping..." : "Stop agent"}
                    </ActionButton>
                    <ActionButton onClick={() => { void handleResetAgent(); }} disabled={actionBusy !== null} tone="warn">
                      {actionBusy === "reset-agent" ? "Resetting..." : "Reset agent"}
                    </ActionButton>
                  </>
                )}
              </div>

              {pendingApproval && (
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold theme-fg">{approvalLabel}</p>
                      <p className="mt-1 text-[12px] leading-relaxed theme-soft">
                        {pendingApproval.toolName ? `Tool: ${pendingApproval.toolName}` : "Manual approval requested."}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <ActionButton onClick={() => { void handleApproval(true); }} disabled={actionBusy !== null} tone="good">
                        {actionBusy === "approve" ? "Sending..." : "Approve"}
                      </ActionButton>
                      <ActionButton onClick={() => { void handleApproval(false); }} disabled={actionBusy !== null} tone="warn">
                        {actionBusy === "deny" ? "Sending..." : "Deny"}
                      </ActionButton>
                    </div>
                  </div>
                </div>
              )}

              {actionNotice && (
                <div className={`rounded-xl border px-3 py-2.5 ${actionNoticeStyles[actionNotice.tone]}`}>
                  <p className="text-[12.5px] font-semibold">{actionNotice.title}</p>
                  <p className="mt-0.5 text-[12px] opacity-80">{actionNotice.detail}</p>
                </div>
              )}
            </div>

            <div className="rounded-xl border border-black/[0.04] bg-black/[0.02] px-3 py-3 dark:border-white/[0.08] dark:bg-white/[0.03]">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[12px] font-semibold theme-fg">Repository state</p>
                <span className="text-[11px] theme-muted">
                  {repoInspection ? repoInspection.branch : "Not inspected"}
                </span>
              </div>
              {repoInspection ? (
                <div className="mt-3 space-y-3">
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <p className="text-[18px] font-bold leading-none theme-fg">{changedFiles.length}</p>
                      <p className="mt-1 text-[11px] theme-muted">Changed</p>
                    </div>
                    <div>
                      <p className="text-[18px] font-bold leading-none theme-fg">{repoInspection.branches.length}</p>
                      <p className="mt-1 text-[11px] theme-muted">Branches</p>
                    </div>
                    <div>
                      <p className="text-[18px] font-bold leading-none theme-fg">{repoInspection.recentCommits.length}</p>
                      <p className="mt-1 text-[11px] theme-muted">Commits</p>
                    </div>
                  </div>

                  {changedFiles.length > 0 ? (
                    <div className="max-h-36 overflow-auto rounded-lg border border-black/[0.04] bg-[var(--stage)] dark:border-white/[0.08]">
                      {changedFiles.slice(0, 8).map((file) => (
                        <div key={`${file.indexStatus}-${file.workTreeStatus}-${file.path}`} className="flex items-center gap-2 border-b border-black/[0.04] px-2.5 py-2 last:border-b-0 dark:border-white/[0.06]">
                          <span className="shrink-0 rounded-full bg-cyan-100 px-2 py-0.5 text-[10px] font-bold text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300">
                            {formatFileStatus(file)}
                          </span>
                          <span className="min-w-0 truncate text-[12px] theme-soft">{file.path}</span>
                        </div>
                      ))}
                      {changedFiles.length > 8 && (
                        <div className="px-2.5 py-2 text-[11px] theme-muted">
                          {changedFiles.length - 8} more changed files
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="rounded-lg border border-emerald-500/15 bg-emerald-500/10 px-3 py-2 text-[12px] text-emerald-700 dark:text-emerald-300">
                      Working tree is clean.
                    </div>
                  )}
                </div>
              ) : (
                <div className="mt-3 rounded-lg border border-dashed border-black/[0.08] px-3 py-6 text-center text-[12px] theme-muted dark:border-white/[0.12]">
                  Run an inspection to see branch, changed files, and recent commits.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Controls row */}
        <div className="mb-4 flex flex-wrap items-center gap-3">
          {/* View toggle */}
          <div className="app-control-rail flex items-center gap-1 rounded-xl p-1">
            <button
              onClick={() => setViewMode("categories")}
              className={`rounded-lg px-3.5 py-1.5 text-[12px] font-medium transition ${
                viewMode === "categories" ? "app-control-active" : "app-control-idle"
              }`}
            >
              Categories
            </button>
            <button
              onClick={() => setViewMode("all")}
              className={`rounded-lg px-3.5 py-1.5 text-[12px] font-medium transition ${
                viewMode === "all" ? "app-control-active" : "app-control-idle"
              }`}
            >
              All
            </button>
          </div>

          <div className="app-control-rail flex items-center gap-1 rounded-xl p-1">
            <button
              onClick={() => setFeedFocus("all")}
              className={`rounded-lg px-3.5 py-1.5 text-[12px] font-medium transition ${
                feedFocus === "all" ? "app-control-active" : "app-control-idle"
              }`}
            >
              All events
            </button>
            <button
              onClick={() => setFeedFocus("attention")}
              className={`rounded-lg px-3.5 py-1.5 text-[12px] font-medium transition ${
                feedFocus === "attention" ? "app-control-active" : "app-control-idle"
              }`}
            >
              Attention ({attentionEvents.length})
            </button>
            <button
              onClick={() => setFeedFocus("sync")}
              className={`rounded-lg px-3.5 py-1.5 text-[12px] font-medium transition ${
                feedFocus === "sync" ? "app-control-active" : "app-control-idle"
              }`}
            >
              Sync ({syncEvents.length})
            </button>
          </div>

          {/* Separator */}
          <div className="h-5 w-px bg-black/[0.08]" />

          {/* Person filter */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setPersonFilter(null)}
              className={`rounded-full px-3 py-1.5 text-[12px] font-medium transition ${
                !personFilter ? "bg-ink text-cream dark:bg-white dark:text-[#17181b]" : "app-surface-strong theme-muted hover:text-[var(--fg)]"
              }`}
            >
              Everyone
            </button>
            {actors.map(([name, initials]) => (
              <button
                key={name}
                onClick={() => setPersonFilter(personFilter === name ? null : name)}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium transition ${
                  personFilter === name
                    ? "bg-ink text-cream dark:bg-white dark:text-[#17181b]"
                    : "app-surface-strong theme-muted hover:text-[var(--fg)]"
                }`}
              >
                <span className={`flex h-4 w-4 items-center justify-center rounded-full text-[8px] font-bold ${
                  personFilter === name ? "bg-cream/20 text-cream dark:bg-black/15 dark:text-[#17181b]" : "app-avatar"
                }`}>
                  {initials}
                </span>
                {name}
              </button>
            ))}
          </div>
        </div>

        {/* Action Queue */}
        <div className="mb-4 app-surface overflow-hidden rounded-xl">
          <div className="flex items-center gap-2 border-b border-black/[0.04] px-4 py-2.5 dark:border-white/[0.08]">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-violet-500">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-13a.75.75 0 00-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 000-1.5h-3.25V5z" clipRule="evenodd" />
            </svg>
            <span className="text-[13px] font-semibold theme-fg">Action Queue</span>
            <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-medium text-violet-700 dark:bg-violet-500/15 dark:text-violet-300">
              {queue.length}
            </span>
            <span className="ml-auto text-[11px] theme-muted">
              {queue.length === 0 ? "Nothing waiting" : queue.length === 1 ? "1 action in progress" : `${queue.length} actions in progress`}
            </span>
          </div>
          {queue.length === 0 ? (
            <div className="px-4 py-5 text-center text-[12.5px] theme-muted">
              You&apos;re all caught up — no pushes, pulls, approvals, or agent runs queued.
            </div>
          ) : (
            <ol className="divide-y divide-black/[0.04] dark:divide-white/[0.08]">
              {queue.map((item, idx) => (
                <li key={item.id} className="flex items-start gap-3 px-4 py-3">
                  <span className={`mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                    item.kind === "approval"
                      ? "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
                      : item.kind === "sync"
                        ? "bg-cyan-100 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300"
                      : "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300"
                  }`}>
                    {idx + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold theme-fg">{item.title}</p>
                    <p className="mt-0.5 truncate text-[12px] theme-soft">{item.description}</p>
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-1.5 text-[11px] theme-muted">
                    {item.kind === "active" ? (
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-violet-500" />
                    ) : item.kind === "sync" ? (
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-500" />
                    ) : (
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                    )}
                    Queued · {formatAgo(item.since)}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>

        {/* Category view */}
        {viewMode === "categories" && (
          <div className="space-y-2">
            {(Object.keys(categoryLabels) as ActivityEvent["type"][])
              .filter((cat) => grouped[cat]?.length)
              .map((cat) => {
                const events = grouped[cat]!;
                const isOpen = expandedCats.has(cat);
                return (
                  <div key={cat} className="app-surface overflow-hidden rounded-xl">
                    <button
                      onClick={() => toggleCat(cat)}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-black/[0.02]"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        className={`h-3.5 w-3.5 theme-muted transition-transform ${isOpen ? "rotate-90" : ""}`}
                      >
                        <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
                      </svg>
                      <span className="flex items-center gap-2">
                        {eventIcons[cat]}
                        <span className="text-[13px] font-semibold theme-fg">{categoryLabels[cat]}</span>
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${categoryColors[cat]}`}>
                        {events.length}
                      </span>
                      <span className="ml-auto text-[12px] theme-muted">{events[0].time}</span>
                    </button>
                    {isOpen && (
                      <div className="border-t border-black/[0.04] px-4 py-1 dark:border-white/[0.08]">
                        {events.map((e) => (
                          <EventRow key={e.id} event={e} />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            {Object.keys(grouped).length === 0 && (
              <div className="app-surface rounded-xl px-4 py-8 text-center text-[13px] theme-muted">
                No activity found{personFilter ? ` for ${personFilter}` : ""}.
              </div>
            )}
          </div>
        )}

        {/* All view — full chronological log */}
        {viewMode === "all" && (
          <div className="app-surface overflow-hidden rounded-xl">
            <div className="divide-y divide-black/[0.04] px-4 dark:divide-white/[0.08]">
              {filtered.length > 0 ? (
                filtered.map((event) => <EventRow key={event.id} event={event} />)
              ) : (
                <div className="py-8 text-center text-[13px] theme-muted">
                  No activity found{personFilter ? ` for ${personFilter}` : ""}.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
