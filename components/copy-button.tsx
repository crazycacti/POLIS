"use client";

import { Check, Copy, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type CopyState = "idle" | "copied" | "failed";

const COPY_STATE_RESET_MS = 2000;

const LABELS: Record<CopyState, string> = {
  idle: "Copy",
  copied: "Copied",
  failed: "Copy failed",
};

export function CopyButton({
  text,
  className,
  label,
}: {
  text: string;
  className?: string;
  label?: string;
}) {
  const [state, setState] = useState<CopyState>("idle");
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
    },
    [],
  );

  function show(next: CopyState) {
    setState(next);
    if (resetTimer.current) clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => setState("idle"), COPY_STATE_RESET_MS);
  }

  return (
    <button
      className={`polis-btn-secondary shrink-0 gap-1.5 ${className ?? ""}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          show("copied");
        } catch {
          show("failed");
        }
      }}
      type="button"
    >
      {state === "copied" ? (
        <Check aria-hidden className="h-3.5 w-3.5 text-emerald-400" />
      ) : state === "failed" ? (
        <X aria-hidden className="h-3.5 w-3.5 text-amber-300" />
      ) : (
        <Copy aria-hidden className="h-3.5 w-3.5" />
      )}
      <span aria-live="polite">{state === "idle" && label ? label : LABELS[state]}</span>
    </button>
  );
}
