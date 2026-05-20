"use client";

import { useMemo } from "react";

import { measurePasswordStrength } from "@/lib/password-strength";

const SEGMENT_COUNT = 4;

function segmentClass(active: boolean, score: number): string {
  if (!active) return "bg-zinc-800";
  if (score <= 1) return "bg-red-500/90";
  if (score === 2) return "bg-amber-500/90";
  if (score === 3) return "bg-cyan-600/90";
  return "bg-emerald-500/90";
}

function labelClass(score: number, hasInput: boolean): string {
  if (!hasInput) return "text-zinc-500";
  if (score <= 1) return "text-red-300/90";
  if (score === 2) return "text-amber-200/90";
  if (score === 3) return "text-cyan-300/90";
  return "text-emerald-300/90";
}

export function PasswordStrengthMeter(props: { password: string }) {
  const strength = useMemo(() => measurePasswordStrength(props.password), [props.password]);
  const filledSegments = strength.score;
  const hasInput = props.password.trim().length > 0;

  return (
    <div aria-live="polite" className="mt-3" role="status">
      <div className="flex gap-1.5">
        {Array.from({ length: SEGMENT_COUNT }, (_, index) => {
          const active = filledSegments > index;
          return (
            <div
              key={index}
              className={`polis-password-strength-segment h-1.5 flex-1 rounded-full ${segmentClass(
                active,
                filledSegments,
              )}`}
              style={{ transitionDelay: `${index * 60}ms` }}
            />
          );
        })}
      </div>
      <p className="mt-2 text-xs text-zinc-500">
        Strength:{" "}
        <span className={labelClass(filledSegments, hasInput)}>
          {hasInput ? strength.label : "Enter a password"}
        </span>
      </p>
    </div>
  );
}
