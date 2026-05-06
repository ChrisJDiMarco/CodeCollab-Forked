"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useActiveDesktopProject } from "@/hooks/use-active-desktop-project";
import { PlansSection, PlanCard } from "@/components/plans-section";
import { buildPickerRows, effortLabel } from "@/lib/model-picker";
import type { DesktopSettings, ModelCatalogEntry, ModelCatalogs, ProjectPlanV2, PlanStepV2, ProjectPlanStatus } from "@/lib/electron";

const STATUS_LABEL: Record<ProjectPlanStatus, string> = {
  draft: "Draft",
  active: "Active",
  executing: "Executing",
  completed: "Completed",
  archived: "Archived",
};

type FeatureFlags = DesktopSettings["featureFlags"];
type CatalogSources = Pick<ModelCatalogs, "copilot" | "claude" | "codex">;

const DEFAULT_FEATURE_FLAGS: FeatureFlags = {
  githubCopilotCli: true,
  claudeCode: false,
  codexCli: false,
  githubCompanion: false,
};

const DEFAULT_COPILOT_MODELS: ModelCatalogEntry[] = [
  { id: "auto", label: "Auto", provider: "Best available", contextWindow: "Auto", maxTokens: 200000, usage: "10% discount", group: "featured" },
  { id: "gpt-5.5|medium", label: "GPT-5.5 (Reasoning: Medium)", baseId: "gpt-5.5", baseLabel: "GPT-5.5", reasoningEffort: "medium", provider: "OpenAI", contextWindow: "256K", maxTokens: 256000, usage: "1x", group: "featured" },
  { id: "gpt-5.5-codex|medium", label: "GPT-5.5 Codex (Reasoning: Medium)", baseId: "gpt-5.5-codex", baseLabel: "GPT-5.5 Codex", reasoningEffort: "medium", provider: "OpenAI", contextWindow: "256K", maxTokens: 256000, usage: "1x", group: "featured" },
  { id: "claude-sonnet-4.5|medium", label: "Claude Sonnet 4.5 (Reasoning: Medium)", baseId: "claude-sonnet-4.5", baseLabel: "Claude Sonnet 4.5", reasoningEffort: "medium", provider: "Anthropic", contextWindow: "200K", maxTokens: 200000, usage: "1x", group: "featured" },
  { id: "claude-opus-4.5|medium", label: "Claude Opus 4.5 (Reasoning: Medium)", baseId: "claude-opus-4.5", baseLabel: "Claude Opus 4.5", reasoningEffort: "medium", provider: "Anthropic", contextWindow: "200K", maxTokens: 200000, usage: "3x", group: "featured" },
];

const DEFAULT_CLAUDE_MODELS: ModelCatalogEntry[] = [
  { id: "sonnet", label: "Claude Sonnet 4.5 (Latest)", provider: "Anthropic", contextWindow: "200K", maxTokens: 200000, usage: "", group: "featured" },
  { id: "opus", label: "Claude Opus 4.5 (Latest)", provider: "Anthropic", contextWindow: "200K", maxTokens: 200000, usage: "", group: "featured" },
  { id: "haiku", label: "Claude Haiku 4.5 (Latest)", provider: "Anthropic", contextWindow: "200K", maxTokens: 200000, usage: "", group: "featured" },
];

const DEFAULT_CODEX_MODELS: ModelCatalogEntry[] = [
  { id: "default", label: "GPT-5.5 Codex (Latest)", provider: "OpenAI", contextWindow: "256K", maxTokens: 256000, usage: "", group: "featured" },
];

const DEFAULT_CATALOG_SOURCES: CatalogSources = {
  copilot: DEFAULT_COPILOT_MODELS,
  claude: DEFAULT_CLAUDE_MODELS,
  codex: DEFAULT_CODEX_MODELS,
};

function getActiveModelCatalog(featureFlags: Partial<FeatureFlags> | undefined, catalogs: CatalogSources): ModelCatalogEntry[] {
  const entries: ModelCatalogEntry[] = [];
  if (featureFlags?.claudeCode) entries.push(...catalogs.claude);
  if (featureFlags?.githubCopilotCli) entries.push(...catalogs.copilot);
  if (featureFlags?.codexCli) entries.push(...catalogs.codex);
  return entries.length > 0 ? entries : catalogs.copilot;
}

function getProviderTabForModel(modelId: string, catalogs: CatalogSources): "claude" | "copilot" | "codex" {
  if (catalogs.claude.some((m) => m.id === modelId)) return "claude";
  if (catalogs.codex.some((m) => m.id === modelId)) return "codex";
  return "copilot";
}

function getDefaultExecutionModel(featureFlags: Partial<FeatureFlags> | undefined, catalogs: CatalogSources, storedModel?: string | null) {
  const activeCatalog = getActiveModelCatalog(featureFlags, catalogs);
  if (storedModel && activeCatalog.some((m) => m.id === storedModel)) return storedModel;
  return activeCatalog[0]?.id ?? "auto";
}

function isPlan(value: unknown): value is ProjectPlanV2 {
  return Boolean(value && typeof value === "object" && typeof (value as { id?: unknown }).id === "string");
}

export default function PlansClient() {
  const { activeProject } = useActiveDesktopProject();
  const router = useRouter();
  const searchParams = useSearchParams();
  const planId = searchParams.get("id");
  const modelMenuRef = useRef<HTMLDivElement | null>(null);
  const modelButtonRef = useRef<HTMLButtonElement | null>(null);

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
  const [featureFlags, setFeatureFlags] = useState<FeatureFlags>(DEFAULT_FEATURE_FLAGS);
  const [catalogSources, setCatalogSources] = useState<CatalogSources>(DEFAULT_CATALOG_SOURCES);
  const [selectedExecutionModel, setSelectedExecutionModel] = useState("auto");
  const [providerTab, setProviderTab] = useState<"claude" | "copilot" | "codex">("copilot");
  const [showModelMenu, setShowModelMenu] = useState(false);
  const [reasoningView, setReasoningView] = useState<{ baseId: string; baseLabel: string } | null>(null);

  const modelCatalog = useMemo(
    () => getActiveModelCatalog(featureFlags, catalogSources),
    [featureFlags, catalogSources]
  );
  const selectedModelMeta = useMemo(
    () => modelCatalog.find((m) => m.id === selectedExecutionModel) ?? modelCatalog[0],
    [modelCatalog, selectedExecutionModel]
  );
  const hasMultipleProviders = [featureFlags.githubCopilotCli, featureFlags.claudeCode, featureFlags.codexCli].filter(Boolean).length > 1;

  useEffect(() => {
    let cancelled = false;

    const loadModelSettings = async () => {
      try {
        const settings = await window.electronAPI?.settings?.get?.();
        const catalogs = await window.electronAPI?.tools?.getModelCatalogs?.();
        const nextFlags = { ...DEFAULT_FEATURE_FLAGS, ...(settings?.featureFlags ?? {}) };
        const nextCatalogs: CatalogSources = {
          copilot: catalogs?.copilot?.length ? catalogs.copilot : DEFAULT_COPILOT_MODELS,
          claude: catalogs?.claude?.length ? catalogs.claude : DEFAULT_CLAUDE_MODELS,
          codex: catalogs?.codex?.length ? catalogs.codex : DEFAULT_CODEX_MODELS,
        };
        const nextModel = getDefaultExecutionModel(nextFlags, nextCatalogs, settings?.projectDefaults?.copilotModel);
        if (cancelled) return;
        setFeatureFlags(nextFlags);
        setCatalogSources(nextCatalogs);
        setSelectedExecutionModel(nextModel);
        setProviderTab(getProviderTabForModel(nextModel, nextCatalogs));
      } catch { /* keep defaults */ }
    };

    const refreshToolStatus = async () => {
      try {
        await window.electronAPI?.tools?.listStatus?.();
        const settings = await window.electronAPI?.settings?.get?.();
        if (!cancelled && settings?.featureFlags) setFeatureFlags({ ...DEFAULT_FEATURE_FLAGS, ...settings.featureFlags });
      } catch { /* background refresh */ }
    };

    void loadModelSettings();
    void refreshToolStatus();
    const stopListening = window.electronAPI?.settings?.onChanged?.((settings) => {
      if (!cancelled && settings.featureFlags) setFeatureFlags({ ...DEFAULT_FEATURE_FLAGS, ...settings.featureFlags });
    });
    return () => { cancelled = true; stopListening?.(); };
  }, []);

  useEffect(() => {
    if (modelCatalog.some((m) => m.id === selectedExecutionModel)) return;
    const fallback = modelCatalog[0]?.id ?? "auto";
    setSelectedExecutionModel(fallback);
    setProviderTab(getProviderTabForModel(fallback, catalogSources));
  }, [catalogSources, modelCatalog, selectedExecutionModel]);

  useEffect(() => {
    if (!showModelMenu) return;
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (modelMenuRef.current?.contains(target) || modelButtonRef.current?.contains(target)) return;
      setShowModelMenu(false);
      setReasoningView(null);
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [showModelMenu]);

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
        model: selectedExecutionModel,
      });
      if (result?.chatId) {
        router.push(`/project/code?session=${encodeURIComponent(result.chatId)}`);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }, [plan, activeProject, router, selectedExecutionModel]);

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

    // Detect peer agent activity for this plan's execution session: when a
    // peer is streaming tokens with sessionId === plan.executionChatId, show
    // the same "Go to live agent" affordance on the invited machine.
    let peerActivityTimer: ReturnType<typeof setTimeout> | null = null;
    const stopChatToken = window.electronAPI?.p2p?.onChatToken?.((event: { projectId?: string; scope?: string; sessionId?: string | null }) => {
      if (!plan.executionChatId) return;
      if (event.projectId && event.projectId !== activeProject.id) return;
      if (event.scope !== "solo-chat") return;
      if (event.sessionId !== plan.executionChatId) return;
      setAgentRunning(true);
      if (peerActivityTimer) clearTimeout(peerActivityTimer);
      peerActivityTimer = setTimeout(() => setAgentRunning(false), 30000);
    });
    const stopChatMessage = window.electronAPI?.p2p?.onChatMessage?.((event: { projectId?: string; scope?: string; conversationId?: string; message?: { id?: string } }) => {
      if (!plan.executionChatId) return;
      if (event.projectId && event.projectId !== activeProject.id) return;
      // The peer broadcasts conversationId="solo-{sessionId}" on the final message.
      if (event.scope !== "solo-chat") return;
      if (typeof event.conversationId === "string" && event.conversationId === `solo-${plan.executionChatId}`) {
        if (peerActivityTimer) { clearTimeout(peerActivityTimer); peerActivityTimer = null; }
        setAgentRunning(false);
      }
    });

    return () => {
      cancelled = true;
      stopStarted?.();
      stopCompleted?.();
      stopError?.();
      stopCancelled?.();
      stopChatToken?.();
      stopChatMessage?.();
      if (peerActivityTimer) clearTimeout(peerActivityTimer);
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
        model: selectedExecutionModel,
      });
      if (result?.chatId) {
        router.push(`/project/code?session=${encodeURIComponent(result.chatId)}`);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }, [plan, activeProject, router, selectedExecutionModel]);

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
  const remaining = plan.steps.filter((s) => s.status !== "done" && s.status !== "skipped").length;
  const isCompleted = plan.status === "completed" || (plan.steps.length > 0 && remaining === 0);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-6">
      {/* Header */}
      <header className="flex flex-col gap-3 border-b border-text-ghost/15 pb-4">
        <Link
          href="/project"
          className="self-start text-[11px] font-semibold uppercase tracking-widest text-text-ghost transition hover:text-violet"
        >
          ← Workspace
        </Link>
        <div className="flex flex-col gap-4">
          <div className="min-w-0 max-w-3xl">
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
            <h1 className="mt-2 text-[28px] font-bold leading-[1.05] tracking-normal text-text-base sm:text-[32px]">{plan.title}</h1>
            {plan.tldr && <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-text-soft">{plan.tldr}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-text-ghost/15 bg-canvas/60 px-3 py-2">
            {!agentRunning && !isCompleted && !isArchived && (
              <div className="relative">
                <button
                  ref={modelButtonRef}
                  type="button"
                  disabled={busy !== null}
                  onClick={() => { setShowModelMenu((v) => !v); setReasoningView(null); }}
                  className="flex min-h-10 w-full min-w-[320px] max-w-[420px] items-center justify-between gap-3 rounded-lg border border-text-ghost/25 bg-canvas px-3 py-2 text-left text-[12px] font-semibold text-text-soft transition hover:border-violet/40 hover:text-violet disabled:opacity-50 sm:w-[380px]"
                  title="Execution model"
                >
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-text-ghost">Execution model</span>
                    <span className="truncate text-[12px] text-text-base">{selectedModelMeta?.label ?? selectedExecutionModel}</span>
                  </span>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3 shrink-0">
                    <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.168l3.71-3.938a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z" clipRule="evenodd" />
                  </svg>
                </button>
                {showModelMenu && (
                  <div
                    ref={modelMenuRef}
                    className="absolute right-0 top-12 z-50 w-[340px] overflow-hidden rounded-[1rem] border border-black/[0.06] bg-[rgba(255,255,255,0.96)] shadow-[0_18px_44px_rgba(0,0,0,0.12)] backdrop-blur-xl dark:border-white/[0.08] dark:bg-[#1a1c20]/95 dark:shadow-[0_18px_44px_rgba(0,0,0,0.34)]"
                  >
                    {hasMultipleProviders && (
                      <div className="flex gap-1 border-b border-black/[0.06] px-2 pb-1.5 pt-2 dark:border-white/[0.08]">
                        {featureFlags.claudeCode && (
                          <button type="button" onClick={() => { setProviderTab("claude"); setReasoningView(null); }} className={`rounded-full px-2.5 py-1 text-[10px] font-bold transition ${providerTab === "claude" ? "bg-ink text-cream dark:bg-white dark:text-[#141414]" : "theme-muted hover:theme-fg"}`}>Claude</button>
                        )}
                        {featureFlags.githubCopilotCli && (
                          <button type="button" onClick={() => { setProviderTab("copilot"); setReasoningView(null); }} className={`rounded-full px-2.5 py-1 text-[10px] font-bold transition ${providerTab === "copilot" ? "bg-ink text-cream dark:bg-white dark:text-[#141414]" : "theme-muted hover:theme-fg"}`}>Copilot</button>
                        )}
                        {featureFlags.codexCli && (
                          <button type="button" onClick={() => { setProviderTab("codex"); setReasoningView(null); }} className={`rounded-full px-2.5 py-1 text-[10px] font-bold transition ${providerTab === "codex" ? "bg-ink text-cream dark:bg-white dark:text-[#141414]" : "theme-muted hover:theme-fg"}`}>Codex</button>
                        )}
                      </div>
                    )}
                    <div className="max-h-[260px] overflow-y-auto p-1.5">
                      {(() => {
                        const tabModels = hasMultipleProviders
                          ? providerTab === "claude" ? catalogSources.claude : providerTab === "codex" ? catalogSources.codex : catalogSources.copilot
                          : modelCatalog;
                        if (reasoningView) {
                          const variants = tabModels
                            .filter((m) => m.baseId === reasoningView.baseId)
                            .slice()
                            .sort((a, b) => ({ low: 0, medium: 1, high: 2 } as Record<string, number>)[a.reasoningEffort ?? ""] - ({ low: 0, medium: 1, high: 2 } as Record<string, number>)[b.reasoningEffort ?? ""]);
                          return (
                            <>
                              <button type="button" onClick={() => setReasoningView(null)} className="flex w-full items-center gap-2 rounded-[0.7rem] px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider theme-muted hover:bg-black/[0.04] dark:hover:bg-white/[0.06]">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none" className="h-3 w-3"><path d="M12.5 4.5 7 10l5.5 5.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
                                <span className="truncate text-[11px] normal-case theme-fg">{reasoningView.baseLabel}</span>
                              </button>
                              <div className="px-3 pb-1 pt-2 text-[9px] font-bold uppercase tracking-wider theme-muted">Reasoning effort</div>
                              {variants.map((m) => (
                                <button key={m.id} type="button" onClick={() => { setSelectedExecutionModel(m.id); setShowModelMenu(false); setReasoningView(null); }} className={`flex w-full items-center justify-between rounded-[0.7rem] px-3 py-2 text-left text-[11px] font-semibold transition ${m.id === selectedExecutionModel ? "bg-ink text-cream dark:bg-white dark:text-[#141414]" : "theme-fg hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"}`}>
                                  <span>{effortLabel(m.reasoningEffort)}</span>
                                  {m.usage && <span className={`text-[9px] ${m.id === selectedExecutionModel ? "text-cream/60 dark:text-[#141414]/60" : "theme-muted"}`}>{m.usage}</span>}
                                </button>
                              ))}
                            </>
                          );
                        }
                        const featuredRows = buildPickerRows(tabModels.filter((m) => m.group === "featured"));
                        const otherRows = buildPickerRows(tabModels.filter((m) => m.group !== "featured"));
                        const renderRow = (row: (typeof featuredRows)[number]) => {
                          if (row.kind === "group") {
                            const selectedVariant = row.variants.find((v) => v.id === selectedExecutionModel);
                            const isSelected = !!selectedVariant;
                            return (
                              <button key={`g:${row.baseId}`} type="button" onClick={() => setReasoningView({ baseId: row.baseId, baseLabel: row.baseLabel })} className={`flex w-full items-center justify-between rounded-[0.7rem] px-3 py-2 text-left text-[11px] font-semibold transition ${isSelected ? "bg-ink text-cream dark:bg-white dark:text-[#141414]" : "theme-fg hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"}`}>
                                <span className="flex min-w-0 items-center gap-1.5">
                                  <span className="truncate">{row.baseLabel}</span>
                                  {selectedVariant ? <span className={`shrink-0 text-[9px] font-medium ${isSelected ? "text-cream/70 dark:text-[#141414]/70" : "theme-muted"}`}>· {effortLabel(selectedVariant.reasoningEffort)}</span> : null}
                                </span>
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none" className="h-3 w-3 opacity-60"><path d="M7.5 4.5 13 10l-5.5 5.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
                              </button>
                            );
                          }
                          const m = row.entry;
                          return (
                            <button key={m.id} type="button" onClick={() => { setSelectedExecutionModel(m.id); setShowModelMenu(false); setReasoningView(null); }} className={`flex w-full items-center justify-between rounded-[0.7rem] px-3 py-2 text-left text-[11px] font-semibold transition ${m.id === selectedExecutionModel ? "bg-ink text-cream dark:bg-white dark:text-[#141414]" : "theme-fg hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"}`}>
                              <span className="truncate">{m.label}</span>
                              {m.contextWindow && <span className={`ml-2 shrink-0 text-[9px] ${m.id === selectedExecutionModel ? "text-cream/60 dark:text-[#141414]/60" : "theme-muted"}`}>{m.contextWindow}</span>}
                            </button>
                          );
                        };
                        return (
                          <>
                            {featuredRows.map(renderRow)}
                            {otherRows.length > 0 && (
                              <>
                                <div className="px-3 pb-1 pt-2 text-[9px] font-bold uppercase tracking-wider theme-muted">Other</div>
                                {otherRows.map(renderRow)}
                              </>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  </div>
                )}
              </div>
            )}
            {(() => {
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
