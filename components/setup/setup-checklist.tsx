"use client";

import { Check } from "lucide-react";

import type { SetupTab } from "@/components/setup/setup-tabs";

type ChecklistItem = {
  tab: SetupTab;
  label: string;
  detail: string;
  done: boolean;
};

export function SetupChecklist(props: {
  active: SetupTab;
  onSelect: (tab: SetupTab) => void;
  keysDetail: string;
  keysDone: boolean;
  lookName: string;
  catalogCount: number;
}) {
  const items: ChecklistItem[] = [
    { tab: "keys", label: "API keys", detail: props.keysDetail, done: props.keysDone },
    { tab: "style", label: "Look", detail: props.lookName, done: true },
    {
      tab: "catalogs",
      label: "Catalogs",
      detail: `${props.catalogCount} ${props.catalogCount === 1 ? "row" : "rows"}`,
      done: props.catalogCount > 0,
    },
  ];

  return (
    <ol aria-label="Setup steps" className="mb-4 flex flex-wrap gap-2">
      {items.map((item, index) => {
        const active = props.active === item.tab;
        return (
          <li className="min-w-36 flex-1" key={item.tab}>
            <button
              aria-current={active ? "step" : undefined}
              className={`polis-focus flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors ${
                active ? "polis-selected" : "hover:bg-white/5"
              }`}
              onClick={() => props.onSelect(item.tab)}
              type="button"
            >
              <span
                aria-hidden
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                  item.done
                    ? "bg-emerald-500/20 text-emerald-300"
                    : "border border-zinc-600 text-zinc-400"
                }`}
              >
                {item.done ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : index + 1}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium text-zinc-100">
                  {item.label}
                  {item.done ? <span className="sr-only">, done</span> : null}
                </span>
                <span className="block truncate text-xs text-zinc-400">{item.detail}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
