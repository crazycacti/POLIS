import type { ReactNode } from "react";

import { CopyButton } from "@/components/copy-button";
import { PolisSwitch } from "@/components/setup/polis-switch";

export function SetupPanel(props: {
  title: string;
  hint?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`polis-card mb-6${props.className ? ` ${props.className}` : ""}`}>
      <h2 className="text-sm font-semibold text-zinc-200">{props.title}</h2>
      {props.hint ? <p className="mt-1 text-sm text-zinc-500">{props.hint}</p> : null}
      <div className={props.hint ? "mt-5" : "mt-4"}>{props.children}</div>
    </section>
  );
}

export function SetupToggle(props: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className={`polis-toggle-row ${props.disabled ? "opacity-50" : ""}`}>
      <span className="text-sm text-zinc-200">{props.label}</span>
      <PolisSwitch
        aria-label={props.label}
        checked={props.checked}
        disabled={props.disabled}
        onChange={props.onChange}
      />
    </div>
  );
}

export function PatternRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-medium text-zinc-500">{label}</p>
      <div className="polis-code flex flex-wrap items-center justify-between gap-3">
        <code className="break-all text-xs text-zinc-300">{value}</code>
        <CopyButton text={value} />
      </div>
    </div>
  );
}
