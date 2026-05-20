"use client";

import { Copy, Check } from "lucide-react";
import { useState } from "react";

export function CopyButton({ text, className }: { text: string; className?: string }) {
  const [done, setDone] = useState(false);

  return (
    <button
      type="button"
      className={`flex shrink-0 items-center gap-1.5 rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-300 hover:border-cyan-600/50 hover:text-white ${className ?? ""}`}
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 2000);
      }}
    >
      {done ? (
        <Check className="h-3.5 w-3.5 text-emerald-400" aria-hidden />
      ) : (
        <Copy className="h-3.5 w-3.5" aria-hidden />
      )}
      {done ? "Copied" : "Copy"}
    </button>
  );
}
