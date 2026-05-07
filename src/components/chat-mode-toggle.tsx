"use client";

import type { ChatMode } from "@/lib/mock-data";

interface ChatModeToggleProps {
  mode: ChatMode;
  onChange?: (mode: ChatMode) => void;
  locked?: boolean;
  lockedReason?: string;
  size?: "sm" | "md";
}

export function ChatModeToggle({
  mode,
  onChange,
  locked = false,
  lockedReason,
  size = "sm",
}: ChatModeToggleProps) {
  const padding = size === "sm" ? "px-2 py-0.5" : "px-2.5 py-1";
  const fontSize = size === "sm" ? "text-[10px]" : "text-[11px]";

  const handleClick = (next: ChatMode) => {
    if (locked || mode === next) return;
    onChange?.(next);
  };

  const baseBtn = `${padding} ${fontSize} font-bold uppercase tracking-widest rounded-md transition`;

  return (
    <div
      className={`inline-flex items-center gap-0.5 rounded-lg border ${
        locked ? "border-violet/30 bg-violet/5" : "border-text-ghost/20 bg-canvas/50"
      } p-0.5`}
      title={locked ? lockedReason || "Mode is locked for this chat" : undefined}
    >
      <button
        type="button"
        disabled={locked && mode !== "plan"}
        onClick={() => handleClick("plan")}
        className={`${baseBtn} ${
          mode === "plan"
            ? "bg-violet text-white"
            : "text-text-soft hover:text-violet"
        } disabled:cursor-not-allowed disabled:opacity-40`}
      >
        Plan
      </button>
      <button
        type="button"
        disabled={locked && mode !== "agent"}
        onClick={() => handleClick("agent")}
        className={`${baseBtn} ${
          mode === "agent"
            ? "bg-mint text-void"
            : "text-text-soft hover:text-mint"
        } disabled:cursor-not-allowed disabled:opacity-40`}
      >
        Agent
      </button>
      <button
        type="button"
        disabled={locked && mode !== "ask"}
        onClick={() => handleClick("ask")}
        className={`${baseBtn} ${
          mode === "ask"
            ? "bg-sky-500 text-white"
            : "text-text-soft hover:text-sky-500"
        } disabled:cursor-not-allowed disabled:opacity-40`}
      >
        Ask
      </button>
      {locked && (
        <span className="ml-0.5 select-none px-1 text-[9px] font-bold text-violet/70" aria-hidden>
          🔒
        </span>
      )}
    </div>
  );
}
