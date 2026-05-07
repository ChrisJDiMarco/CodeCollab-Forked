"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ProjectPlanV2, ProjectPlanStatus } from "@/lib/electron";

const STATUS_LABEL: Record<ProjectPlanStatus, string> = {
  draft: "Draft",
  active: "Active",
  executing: "Executing",
  completed: "Completed",
  archived: "Archived",
};

const STATUS_PILL: Record<ProjectPlanStatus, string> = {
  draft: "bg-text-ghost/15 text-text-soft",
  active: "bg-violet/20 text-violet",
  executing: "bg-sun/20 text-sun",
  completed: "bg-mint/20 text-mint",
  archived: "bg-text-ghost/10 text-text-ghost",
};

const SOURCE_LABEL: Record<string, string> = {
  "pm-chat": "PM chat",
  "task-chat": "Task chat",
  "solo-chat": "Freestyle",
  manual: "Manual",
};

function isPlanLike(value: unknown): value is ProjectPlanV2 {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof (value as { id?: unknown }).id === "string" &&
      typeof (value as { title?: unknown }).title === "string"
  );
}

function planStepProgress(plan: ProjectPlanV2) {
  const total = plan.steps?.length ?? 0;
  const done = (plan.steps ?? []).filter((step) => step.status === "done").length;
  return { done, total, pct: total > 0 ? Math.round((done / total) * 100) : 0 };
}

function planUpdatedShort(plan: ProjectPlanV2) {
  const ts = plan.updatedAt || plan.createdAt;
  if (!ts) return "";
  const d = new Date(ts);
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

interface PlansSectionProps {
  projectId: string;
  rawPlans: unknown[];
  activePlanId?: string | null;
}

export function PlansSection({ projectId, rawPlans, activePlanId }: PlansSectionProps) {
  const [showArchived, setShowArchived] = useState(false);

  const plans = useMemo(() => {
    return (Array.isArray(rawPlans) ? rawPlans : []).filter(isPlanLike);
  }, [rawPlans]);

  const visiblePlans = useMemo(() => {
    return plans
      .filter((plan) => (showArchived ? true : plan.status !== "archived"))
      .sort((a, b) => {
        if (a.id === activePlanId) return -1;
        if (b.id === activePlanId) return 1;
        const aTs = new Date(a.updatedAt || a.createdAt || 0).getTime();
        const bTs = new Date(b.updatedAt || b.createdAt || 0).getTime();
        return bTs - aTs;
      });
  }, [plans, activePlanId, showArchived]);

  const activePlan = useMemo(
    () => (activePlanId ? plans.find((p) => p.id === activePlanId) : null),
    [plans, activePlanId]
  );

  const archivedCount = plans.filter((p) => p.status === "archived").length;

  if (plans.length === 0) {
    return (
      <section className="mb-3 rounded-lg border border-violet/15 bg-violet/[0.04] px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-violet/70">Plans</p>
            <p className="mt-0.5 text-[12px] text-text-soft">
              No plans yet. Use PM Chat to generate a plan, or use the Plan toggle in any chat.
            </p>
          </div>
          <Link
            href="/project/chat?scope=project-manager"
            className="rounded-lg bg-violet/20 px-3 py-1.5 text-[11px] font-semibold text-violet transition hover:bg-violet/30"
          >
            + New plan
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="mb-3 rounded-lg border border-violet/15 bg-violet/[0.03] px-3 py-2.5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-violet/70">Plans</p>
          <p className="text-[11px] text-text-soft">
            {visiblePlans.length} {visiblePlans.length === 1 ? "plan" : "plans"}
            {archivedCount > 0 ? ` • ${archivedCount} archived` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {archivedCount > 0 && (
            <button
              type="button"
              onClick={() => setShowArchived((v) => !v)}
              className="rounded-md border border-text-ghost/20 px-2 py-1 text-[10px] font-semibold text-text-soft transition hover:border-violet/40 hover:text-violet"
            >
              {showArchived ? "Hide archived" : "Show archived"}
            </button>
          )}
          <Link
            href="/project/chat?scope=project-manager"
            className="rounded-md bg-violet/20 px-2.5 py-1 text-[11px] font-semibold text-violet transition hover:bg-violet/30"
          >
            + New plan
          </Link>
        </div>
      </div>

      {activePlan && (
        <PlanCard projectId={projectId} plan={activePlan} variant="active" />
      )}

      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {visiblePlans
          .filter((plan) => plan.id !== activePlan?.id)
          .map((plan) => (
            <PlanCard key={plan.id} projectId={projectId} plan={plan} variant="grid" />
          ))}
      </div>
    </section>
  );
}

interface PlanCardProps {
  projectId: string;
  plan: ProjectPlanV2;
  variant: "active" | "grid" | "inline";
}

export function PlanCard({ projectId, plan, variant }: PlanCardProps) {
  void projectId;
  const progress = planStepProgress(plan);
  const isActive = variant === "active";
  const sourceLabel = SOURCE_LABEL[plan.source?.kind || "manual"] || "Plan";

  return (
    <Link
      href={`/project/plans?id=${encodeURIComponent(plan.id)}`}
      className={`block rounded-lg border px-3 py-2.5 transition ${
        isActive
          ? "border-violet/40 bg-violet/10 hover:border-violet/60"
          : "border-black/[0.12] bg-canvas/40 hover:border-violet/40 dark:border-white/[0.1]"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest ${STATUS_PILL[plan.status]}`}>
              {STATUS_LABEL[plan.status]}
            </span>
            <span className="rounded-full border border-text-ghost/20 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-widest text-text-ghost">
              {sourceLabel}
            </span>
          </div>
          <p className="mt-1 truncate text-[13px] font-semibold text-text-base">{plan.title}</p>
          {plan.tldr && (
            <p className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-text-soft">{plan.tldr}</p>
          )}
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 text-[10px] text-text-ghost">
        <span>
          {progress.total > 0 ? `${progress.done}/${progress.total} steps` : "No steps"}
          {progress.total > 0 ? ` • ${progress.pct}%` : ""}
        </span>
        <span>{planUpdatedShort(plan)}</span>
      </div>
      {progress.total > 0 && (
        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-text-ghost/15">
          <div
            className="h-full rounded-full bg-gradient-to-r from-violet to-mint"
            style={{ width: `${progress.pct}%` }}
          />
        </div>
      )}
    </Link>
  );
}
