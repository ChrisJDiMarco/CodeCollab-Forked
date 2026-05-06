"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useActiveDesktopProject } from "@/hooks/use-active-desktop-project";
import { PlansSection, PlanCard } from "@/components/plans-section";
import type { ProjectPlanV2, PlanStepV2, ProjectPlanStatus } from "@/lib/electron";

const STATUS_LABEL: Record<ProjectPlanStatus, string> = {
  draft: "Draft",
  active: "Active",
  executing: "Executing",
  completed: "Completed",
  archived: "Archived",
};

function isPlan(value: unknown): value is ProjectPlanV2 {
  return Boolean(value && typeof value === "object" && typeof (value as { id?: unknown }).id === "string");
}

export default function PlansClient() {
  const { activeProject } = useActiveDesktopProject();
  const router = useRouter();
  const searchParams = useSearchParams();
  const planId = searchParams.get("id");

  const dashboard = activeProject?.dashboard as
    | { plans?: unknown[]; activePlanId?: string | null }
    | undefined;
  const plans = useMemo<ProjectPlanV2[]>(
    () => (Array.isArray(dashboard?.plans) ? dashboard.plans : []).filter(isPlan),
    [dashboard]
  );
  const activePlanId = dashboard?.activePlanId ?? null;
  const plan = useMemo(() => plans.find((p) => p.id === planId) ?? null, [plans, planId]);

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onSetActive = useCallback(async () => {
    if (!plan || !activeProject) return;
    setBusy("active");
    setError(null);
    try {
      await window.electronAPI?.project.setActivePlan({ projectId: activeProject.id, planId: plan.id });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }, [plan, activeProject]);

  const onArchive = useCallback(async () => {
    if (!plan || !activeProject) return;
    setBusy("archive");
    setError(null);
    try {
      await window.electronAPI?.project.archivePlan({ projectId: activeProject.id, planId: plan.id });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }, [plan, activeProject]);

  const onDelete = useCallback(async () => {
    if (!plan || !activeProject) return;
    if (!window.confirm(`Delete plan "${plan.title}"? This cannot be undone.`)) return;
    setBusy("delete");
    setError(null);
    try {
      await window.electronAPI?.project.deletePlanV2({ projectId: activeProject.id, planId: plan.id });
      router.push("/project");
    } catch (err) {
      setError((err as Error).message);
      setBusy(null);
    }
  }, [plan, activeProject, router]);

  const onExecute = useCallback(async () => {
    if (!plan || !activeProject) return;
    setBusy("execute");
    setError(null);
    try {
      const result = await window.electronAPI?.project.executePlan({
        projectId: activeProject.id,
        planId: plan.id,
      });
      if (result?.chatId) {
        router.push(`/project/code?session=${encodeURIComponent(result.chatId)}`);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }, [plan, activeProject, router]);

  // Track whether the agent is currently running for THIS plan, so we can
  // swap the primary action button between "Execute", "Go to live agent",
  // "Continue remaining steps", and "Open preview".
  const [agentRunning, setAgentRunning] = useState(false);
  useEffect(() => {
    if (!plan || !activeProject) {
      setAgentRunning(false);
      return;
    }
    let cancelled = false;
    const checkActive = async () => {
      try {
        const req = await window.electronAPI?.project?.getActiveRequest?.();
        if (cancelled) return;
        const isThisPlan = !!(req?.active
          && req.projectId === activeProject.id
          && plan.executionChatId
          && req.sessionId === plan.executionChatId);
        setAgentRunning(isThisPlan);
      } catch { /* ignore */ }
    };
    void checkActive();
    const stopStarted = window.electronAPI?.project?.onAgentStarted?.((event) => {
      if (event.projectId !== activeProject.id) return;
      if (plan.executionChatId && event.sessionId === plan.executionChatId) {
        setAgentRunning(true);
      }
    });
    const stopDone = (event: { projectId?: string; sessionId?: string }) => {
      if (event.projectId !== activeProject.id) return;
      if (plan.executionChatId && event.sessionId === plan.executionChatId) {
        setAgentRunning(false);
      }
    };
    const stopCompleted = window.electronAPI?.project?.onAgentCompleted?.(stopDone);
    const stopError = window.electronAPI?.project?.onAgentError?.(stopDone);
    const stopCancelled = window.electronAPI?.project?.onAgentCancelled?.(stopDone);
    return () => {
      cancelled = true;
      stopStarted?.();
      stopCompleted?.();
      stopError?.();
      stopCancelled?.();
    };
  }, [plan?.id, plan?.executionChatId, activeProject?.id]);

  const onGoToLive = useCallback(() => {
    if (!plan?.executionChatId) return;
    router.push(`/project/code?session=${encodeURIComponent(plan.executionChatId)}`);
  }, [plan?.executionChatId, router]);

  const onContinue = useCallback(async () => {
    if (!plan || !activeProject) return;
    setBusy("execute");
    setError(null);
    try {
      // Re-running executePlan creates a fresh execution session that will
      // pick up where the previous run left off (steps marked done are
      // included in the prompt context so the agent skips them).
      const result = await window.electronAPI?.project.executePlan({
        projectId: activeProject.id,
        planId: plan.id,
      });
      if (result?.chatId) {
        router.push(`/project/code?session=${encodeURIComponent(result.chatId)}`);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }, [plan, activeProject, router]);

  const onUpdateStepStatus = useCallback(
    async (stepId: string, status: PlanStepV2["status"]) => {
      if (!plan || !activeProject) return;
      const next: ProjectPlanV2 = {
        ...plan,
        steps: plan.steps.map((s) => (s.id === stepId ? { ...s, status } : s)),
        updatedAt: new Date().toISOString(),
      };
      try {
        await window.electronAPI?.project.savePlanV2({ plan: next });
      } catch (err) {
        setError((err as Error).message);
      }
    },
    [plan, activeProject]
  );

  useEffect(() => {
    setError(null);
  }, [planId]);

  // Index view (no plan id) — list all plans
  if (!planId) {
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 px-4 py-6">
        <header className="flex items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl font-bold text-text-base">Plans</h1>
            <p className="text-[12px] text-text-soft">
              Plans generated by PM chat or saved from any plan-mode chat.
            </p>
          </div>
          <Link
            href="/project"
            className="rounded-lg border border-text-ghost/30 px-3 py-1.5 text-[12px] font-semibold text-text-soft transition hover:border-violet/40 hover:text-violet"
          >
            ← Workspace
          </Link>
        </header>

        {activeProject ? (
          <PlansSection
            projectId={activeProject.id}
            rawPlans={dashboard?.plans ?? []}
            activePlanId={activePlanId}
          />
        ) : (
          <p className="text-text-soft">No active project.</p>
        )}
      </div>
    );
  }

  if (!activeProject) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 text-center text-text-soft">
        Loading project…
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-3 px-4 py-10 text-center">
        <h1 className="text-xl font-bold text-text-base">Plan not found</h1>
        <p className="text-[13px] text-text-soft">This plan has been deleted or does not belong to the active project.</p>
        <Link href="/project" className="rounded-lg bg-violet/20 px-3 py-1.5 text-[12px] font-semibold text-violet">
          Back to workspace
        </Link>
      </div>
    );
  }

  const isActive = activePlanId === plan.id;
  const isArchived = plan.status === "archived";

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-6">
      {/* Header */}
      <header className="flex flex-col gap-2 border-b border-text-ghost/15 pb-3">
        <Link
          href="/project"
          className="self-start text-[11px] font-semibold uppercase tracking-widest text-text-ghost transition hover:text-violet"
        >
          ← Workspace
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="rounded-full bg-violet/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-violet">
                {STATUS_LABEL[plan.status]}
              </span>
              {isActive && (
                <span className="rounded-full bg-mint/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-mint">
                  Active
                </span>
              )}
              <span className="rounded-full border border-text-ghost/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-text-ghost">
                {plan.source?.kind || "manual"}
              </span>
            </div>
            <h1 className="mt-1 text-2xl font-bold text-text-base">{plan.title}</h1>
            {plan.tldr && <p className="mt-1 text-[13px] leading-relaxed text-text-soft">{plan.tldr}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {(() => {
              const remaining = plan.steps.filter((s) => s.status !== "done" && s.status !== "skipped").length;
              const isCompleted = plan.status === "completed" || (plan.steps.length > 0 && remaining === 0);

              if (agentRunning) {
                return (
                  <button
                    type="button"
                    onClick={onGoToLive}
                    className="flex items-center gap-2 rounded-lg bg-violet px-3 py-1.5 text-[12px] font-bold text-white transition hover:bg-violet/90"
                  >
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white/70 opacity-75" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
                    </span>
                    Go to live agent
                  </button>
                );
              }
              if (isCompleted) {
                return (
                  <>
                    <Link
                      href="/project/preview"
                      className="rounded-lg bg-emerald-500 px-3 py-1.5 text-[12px] font-bold text-white transition hover:bg-emerald-500/90"
                    >
                      Open Preview
                    </Link>
                    {plan.executionChatId && (
                      <Link
                        href={`/project/code?session=${encodeURIComponent(plan.executionChatId)}`}
                        className="rounded-lg border border-violet/40 px-3 py-1.5 text-[12px] font-semibold text-violet transition hover:bg-violet/10"
                      >
                        View execution
                      </Link>
                    )}
                  </>
                );
              }
              if (plan.status === "executing" && remaining > 0) {
                return (
                  <>
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={onContinue}
                      className="rounded-lg bg-violet px-3 py-1.5 text-[12px] font-bold text-white transition hover:bg-violet/90 disabled:opacity-50"
                    >
                      {busy === "execute" ? "Starting…" : `Continue remaining ${remaining} ${remaining === 1 ? "step" : "steps"}`}
                    </button>
                    {plan.executionChatId && (
                      <Link
                        href={`/project/code?session=${encodeURIComponent(plan.executionChatId)}`}
                        className="rounded-lg border border-violet/40 px-3 py-1.5 text-[12px] font-semibold text-violet transition hover:bg-violet/10"
                      >
                        View execution
                      </Link>
                    )}
                  </>
                );
              }
              return (
                <button
                  type="button"
                  disabled={busy !== null || isArchived}
                  onClick={onExecute}
                  className="rounded-lg bg-violet px-3 py-1.5 text-[12px] font-bold text-white transition hover:bg-violet/90 disabled:opacity-50"
                >
                  {busy === "execute" ? "Starting…" : "Execute plan"}
                </button>
              );
            })()}
            {!isActive && !isArchived && (
              <button
                type="button"
                disabled={busy !== null}
                onClick={onSetActive}
                className="rounded-lg border border-violet/40 px-3 py-1.5 text-[12px] font-semibold text-violet transition hover:bg-violet/10 disabled:opacity-50"
              >
                {busy === "active" ? "Setting…" : "Set as active"}
              </button>
            )}
            {!isArchived && (
              <button
                type="button"
                disabled={busy !== null}
                onClick={onArchive}
                className="rounded-lg border border-text-ghost/30 px-3 py-1.5 text-[12px] font-semibold text-text-soft transition hover:border-sun/40 hover:text-sun disabled:opacity-50"
              >
                {busy === "archive" ? "Archiving…" : "Archive"}
              </button>
            )}
            <button
              type="button"
              disabled={busy !== null}
              onClick={onDelete}
              className="rounded-lg border border-coral/40 px-3 py-1.5 text-[12px] font-semibold text-coral transition hover:bg-coral/10 disabled:opacity-50"
            >
              {busy === "delete" ? "Deleting…" : "Delete"}
            </button>
          </div>
        </div>
        {error && <p className="text-[12px] text-coral">{error}</p>}
      </header>

      {/* Steps */}
      <section className="rounded-lg border border-black/[0.12] bg-canvas/50 p-3 dark:border-white/[0.1]">
        <h2 className="text-[11px] font-bold uppercase tracking-widest text-violet/70">Steps</h2>
        {plan.steps.length === 0 ? (
          <p className="mt-2 text-[12px] text-text-soft">No steps were extracted for this plan.</p>
        ) : (
          <ol className="mt-2 flex flex-col gap-1.5">
            {plan.steps.map((step, idx) => (
              <li
                key={step.id}
                className="flex items-start gap-2 rounded-lg border border-text-ghost/10 px-2.5 py-1.5"
              >
                <span className="mt-0.5 select-none text-[10px] font-bold text-text-ghost">{idx + 1}.</span>
                <p className="flex-1 text-[13px] leading-relaxed text-text-base">{step.text}</p>
                <select
                  value={step.status}
                  onChange={(e) =>
                    onUpdateStepStatus(step.id, e.target.value as PlanStepV2["status"])
                  }
                  className="rounded-md border border-text-ghost/20 bg-canvas px-1.5 py-0.5 text-[10px] font-semibold text-text-soft"
                >
                  <option value="pending">Pending</option>
                  <option value="running">Running</option>
                  <option value="done">Done</option>
                  <option value="skipped">Skipped</option>
                </select>
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* Relevant files */}
      {plan.relevantFiles.length > 0 && (
        <section className="rounded-lg border border-black/[0.12] bg-canvas/50 p-3 dark:border-white/[0.1]">
          <h2 className="text-[11px] font-bold uppercase tracking-widest text-violet/70">Relevant files</h2>
          <ul className="mt-2 flex flex-col gap-1">
            {plan.relevantFiles.map((file) => (
              <li key={file.path} className="text-[12px] text-text-soft">
                <code className="rounded bg-text-ghost/10 px-1 py-0.5 text-[11px] text-text-base">{file.path}</code>
                {file.note && <span className="ml-2 text-text-soft">— {file.note}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Verification */}
      {plan.verification.length > 0 && (
        <section className="rounded-lg border border-black/[0.12] bg-canvas/50 p-3 dark:border-white/[0.1]">
          <h2 className="text-[11px] font-bold uppercase tracking-widest text-violet/70">Verification</h2>
          <ul className="mt-2 flex list-disc flex-col gap-1 pl-5">
            {plan.verification.map((item, idx) => (
              <li key={idx} className="text-[12px] text-text-soft">{item}</li>
            ))}
          </ul>
        </section>
      )}

      {/* Decisions */}
      {plan.decisions && plan.decisions.length > 0 && (
        <section className="rounded-lg border border-black/[0.12] bg-canvas/50 p-3 dark:border-white/[0.1]">
          <h2 className="text-[11px] font-bold uppercase tracking-widest text-violet/70">Decisions</h2>
          <ul className="mt-2 flex list-disc flex-col gap-1 pl-5">
            {plan.decisions.map((item, idx) => (
              <li key={idx} className="text-[12px] text-text-soft">{item}</li>
            ))}
          </ul>
        </section>
      )}

      {/* Further considerations */}
      {plan.furtherConsiderations && plan.furtherConsiderations.length > 0 && (
        <section className="rounded-lg border border-black/[0.12] bg-canvas/50 p-3 dark:border-white/[0.1]">
          <h2 className="text-[11px] font-bold uppercase tracking-widest text-violet/70">
            Further considerations
          </h2>
          <ul className="mt-2 flex list-disc flex-col gap-1 pl-5">
            {plan.furtherConsiderations.map((item, idx) => (
              <li key={idx} className="text-[12px] text-text-soft">{item}</li>
            ))}
          </ul>
        </section>
      )}

      {/* Raw markdown fallback */}
      {plan.rawMarkdown && (
        <details className="rounded-lg border border-black/[0.12] bg-canvas/50 p-3 dark:border-white/[0.1]">
          <summary className="cursor-pointer text-[11px] font-bold uppercase tracking-widest text-text-ghost">
            Original plan markdown
          </summary>
          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-md bg-void/30 p-2 text-[11px] leading-relaxed text-text-soft">
            {plan.rawMarkdown}
          </pre>
        </details>
      )}

      {/* Quick navigation between sibling plans */}
      {plans.length > 1 && (
        <section className="mt-2">
          <h2 className="mb-1.5 text-[11px] font-bold uppercase tracking-widest text-text-ghost">Other plans</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {plans
              .filter((p) => p.id !== plan.id)
              .slice(0, 4)
              .map((p) => (
                <PlanCard key={p.id} projectId={activeProject.id} plan={p} variant="grid" />
              ))}
          </div>
        </section>
      )}
    </div>
  );
}
