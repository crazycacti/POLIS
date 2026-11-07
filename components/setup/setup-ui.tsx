import { Check } from "lucide-react";
import type { ReactNode } from "react";

import { CopyButton } from "@/components/copy-button";

export function SetupPanel(props: {
  title: string;
  hint?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`polis-card mb-6${props.className ? ` ${props.className}` : ""}`}>
      <h2 className="text-sm font-semibold text-zinc-200">{props.title}</h2>
      {props.hint ? <p className="mt-1 text-sm text-zinc-400">{props.hint}</p> : null}
      <div className={props.hint ? "mt-5" : "mt-4"}>{props.children}</div>
    </section>
  );
}

export function SetupSegmented<T extends string>(props: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div aria-label={props.label} className="flex w-fit gap-1 rounded-full bg-zinc-900 p-1" role="group">
      {props.options.map((option) => (
        <button
          aria-pressed={props.value === option.value}
          className={`polis-focus min-h-10 rounded-full px-4 text-sm transition-colors pointer-coarse:min-h-11 ${
            props.value === option.value ? "polis-selected" : "text-zinc-400 hover:bg-white/5 hover:text-white"
          }`}
          key={option.value}
          onClick={() => props.onChange(option.value)}
          type="button"
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function PatternRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="mb-1.5 text-sm font-medium text-zinc-300">{label}</p>
      <div className="polis-code flex flex-wrap items-center justify-between gap-3">
        <code className="break-all text-xs text-zinc-300">{value}</code>
        <CopyButton text={value} />
      </div>
    </div>
  );
}

export function SelectionCheck() {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute left-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-cyan-400 text-black shadow"
    >
      <Check className="h-3.5 w-3.5" strokeWidth={3} />
    </span>
  );
}
