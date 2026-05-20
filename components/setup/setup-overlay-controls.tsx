"use client";

import type { ReactNode } from "react";

import { PolisSwitch } from "@/components/setup/polis-switch";
import { SetupToggle } from "@/components/setup/setup-ui";

export function SetupOverlayOption(props: {
  checked: boolean;
  customize?: ReactNode;
  disabled?: boolean;
  label: string;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="border-b border-white/5 py-3 last:border-0">
      <SetupToggle
        checked={props.checked}
        disabled={props.disabled}
        label={props.label}
        onChange={props.onCheckedChange}
      />
      {props.checked && props.customize ? (
        <details className="polis-overlay-details mt-3">
          <summary>Customize</summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">{props.customize}</div>
        </details>
      ) : null}
    </div>
  );
}

export function SetupOverlayField(props: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${props.className ?? ""}`}>
      <span className="mb-1.5 block text-xs text-zinc-500">{props.label}</span>
      {props.children}
    </label>
  );
}

export function SetupOverlayRange(props: {
  label: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  value: number;
  className?: string;
}) {
  return (
    <SetupOverlayField className={props.className} label={props.label}>
      <span className="mb-1 flex justify-end font-mono text-[11px] text-zinc-600">{props.value}px</span>
      <input
        className="w-full accent-cyan-500"
        max={props.max}
        min={props.min}
        onChange={(e) => props.onChange(Number(e.target.value) || props.value)}
        type="range"
        value={props.value}
      />
    </SetupOverlayField>
  );
}

export function SetupOverlaySwitch(props: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="polis-switch-row">
      <span>{props.label}</span>
      <PolisSwitch
        aria-label={props.label}
        checked={props.checked}
        onChange={props.onChange}
      />
    </div>
  );
}

export function SetupOverlayColor(props: {
  auto: boolean;
  autoLabel?: string;
  color: string;
  onAutoChange: (auto: boolean) => void;
  onColorChange: (color: string) => void;
}) {
  return (
    <>
      <SetupOverlaySwitch
        checked={props.auto}
        label={props.autoLabel ?? "Match poster colors"}
        onChange={props.onAutoChange}
      />
      {!props.auto ? (
        <SetupOverlayField label="Color">
          <input
            className="polis-input h-10 max-w-xs cursor-pointer p-1"
            onChange={(e) => props.onColorChange(e.target.value)}
            type="color"
            value={props.color}
          />
        </SetupOverlayField>
      ) : null}
    </>
  );
}

export function SetupOverlayNote(props: { children: ReactNode }) {
  return <p className="text-xs leading-relaxed text-zinc-600 sm:col-span-2">{props.children}</p>;
}
