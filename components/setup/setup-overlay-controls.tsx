"use client";

import type { ReactNode } from "react";

import { PolisSwitch } from "@/components/setup/polis-switch";

export function SetupOverlayField(props: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${props.className ?? ""}`}>
      <span className="mb-1.5 block text-sm text-zinc-300">{props.label}</span>
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
      <span className="mb-1 flex justify-end font-mono text-xs text-zinc-400">{props.value}px</span>
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
    <label className="polis-switch-row min-h-10 cursor-pointer">
      <span>{props.label}</span>
      <PolisSwitch checked={props.checked} insideLabel onChange={props.onChange} />
    </label>
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
