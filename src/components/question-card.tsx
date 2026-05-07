"use client";

import { useState } from "react";
import type { AgentQuestion } from "@/lib/electron";

interface QuestionCardProps {
  question: AgentQuestion;
  onAnswer: (payload: { answer: string; optionId?: string }) => void;
  onDismiss?: () => void;
  resolved?: boolean;
  resolvedAnswer?: string;
}

/**
 * Shared UI for surfacing a clarifying question from the agent. Renders option
 * buttons (when provided) and an optional free-text response. Mirrors the
 * approval banner visual language (amber accent) but uses sky for "needs info".
 */
export function QuestionCard({ question, onAnswer, onDismiss, resolved, resolvedAnswer }: QuestionCardProps) {
  const [custom, setCustom] = useState("");

  if (resolved) {
    return (
      <div className="border-t border-sky-500/20 bg-sky-500/6 px-3.5 py-2.5">
        <div className="mb-1 flex items-center gap-1.5">
          <span className="text-[11px] font-semibold text-sky-600 dark:text-sky-400">Question answered</span>
        </div>
        <p className="mb-1 text-[12px] theme-fg">{question.question}</p>
        {resolvedAnswer ? (
          <p className="rounded bg-sky-500/8 px-2 py-1 text-[11px] theme-muted">
            <span className="font-semibold text-sky-700 dark:text-sky-300">You:</span> {resolvedAnswer}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="border-t border-sky-500/25 bg-sky-500/8 px-3.5 py-2.5 dark:bg-sky-500/6">
      <div className="mb-1.5 flex items-center gap-1.5">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5 shrink-0 text-sky-500">
          <path fillRule="evenodd" d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM6.78 5.595a1.25 1.25 0 1 1 1.94 1.591c-.13.16-.29.299-.428.42-.082.072-.157.139-.221.205a2.5 2.5 0 0 0-.32.398.75.75 0 0 0 1.318.722l.001-.002.005-.008a.998.998 0 0 1 .066-.092 1 1 0 0 1 .142-.144c.094-.083.225-.197.395-.354.337-.31.815-.795.815-1.736a2.75 2.75 0 1 0-5.5 0 .75.75 0 1 0 1.5 0 1.25 1.25 0 0 1 .288-.8ZM8 12a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd" />
        </svg>
        <span className="text-[11px] font-semibold text-sky-600 dark:text-sky-400">Agent needs your input</span>
        {onDismiss ? (
          <button
            type="button"
            onClick={onDismiss}
            className="ml-auto text-[11px] theme-muted hover:theme-fg"
            aria-label="Dismiss"
          >
            ×
          </button>
        ) : null}
      </div>
      <p className="mb-2 whitespace-pre-wrap text-[12px] font-medium theme-fg">{question.question}</p>
      {question.options && question.options.length > 0 ? (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {question.options.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => onAnswer({ answer: opt.label, optionId: opt.id })}
              className="rounded-md bg-sky-500/12 px-2.5 py-1 text-[12px] font-medium text-sky-700 transition hover:bg-sky-500/20 dark:text-sky-300"
              title={opt.description}
            >
              {opt.label}
            </button>
          ))}
        </div>
      ) : null}
      {question.allowCustomResponse ? (
        <div className="flex items-end gap-2">
          <textarea
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && custom.trim()) {
                e.preventDefault();
                onAnswer({ answer: custom.trim() });
                setCustom("");
              }
            }}
            placeholder={question.options?.length ? "Or type your own response…" : "Type your answer…"}
            rows={2}
            className="flex-1 resize-none rounded-md border border-[var(--hairline)] bg-[var(--void)] px-2 py-1.5 text-[12px] theme-fg placeholder:theme-muted focus:border-sky-500/40 focus:outline-none"
          />
          <button
            type="button"
            disabled={!custom.trim()}
            onClick={() => {
              if (!custom.trim()) return;
              onAnswer({ answer: custom.trim() });
              setCustom("");
            }}
            className="rounded-md bg-sky-500/15 px-3 py-1.5 text-[12px] font-semibold text-sky-700 transition enabled:hover:bg-sky-500/25 disabled:opacity-40 dark:text-sky-300"
          >
            Send
          </button>
        </div>
      ) : null}
    </div>
  );
}
