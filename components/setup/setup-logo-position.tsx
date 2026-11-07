"use client";

import type { GridCell } from "@/lib/poster-query";

const CELL_LABELS = [
  "Top left",
  "Top center",
  "Top right",
  "Middle left",
  "Center",
  "Middle right",
  "Bottom left",
  "Bottom center",
  "Bottom right",
] as const;

export function SetupLogoPosition(props: { value: GridCell; onChange: (cell: GridCell) => void }) {
  return (
    <fieldset className="block">
      <legend className="mb-1.5 block text-sm text-zinc-300">Position</legend>
      <div className="grid w-fit grid-cols-3 gap-1.5 rounded-lg border border-zinc-800 p-1.5">
        {CELL_LABELS.map((label, index) => {
          const selected = props.value === index;
          return (
            <button
              aria-label={label}
              aria-pressed={selected}
              className={`polis-focus flex h-11 w-11 items-center justify-center rounded-md transition-colors ${
                selected ? "polis-selected" : "hover:bg-white/5"
              }`}
              key={label}
              onClick={() => props.onChange(index as GridCell)}
              type="button"
            >
              <span aria-hidden className="h-2 w-5 rounded-full bg-zinc-500" />
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
