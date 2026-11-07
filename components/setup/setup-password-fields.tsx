"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";

import { PasswordStrengthMeter } from "@/components/setup/password-strength-meter";
import { POLIS_MIN_PASSWORD_LENGTH } from "@/lib/polis-config-auth-constants";

export function SetupPasswordFields(props: {
  password: string;
  confirm: string;
  onPasswordChange: (value: string) => void;
  onConfirmChange: (value: string) => void;
  disabled?: boolean;
  hint?: string;
  username: string;
}) {
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [confirmVisible, setConfirmVisible] = useState(false);

  return (
    <div className="space-y-3">
      {props.hint ? <p className="text-sm text-zinc-400">{props.hint}</p> : null}
      <input
        aria-hidden
        autoComplete="username"
        className="sr-only"
        name="username"
        readOnly
        tabIndex={-1}
        type="text"
        value={props.username}
      />
      <label className="block">
        <span className="mb-1.5 block text-sm text-zinc-300">Password</span>
        <div className="relative">
          <input
            autoComplete="new-password"
            className="polis-input pr-10"
            disabled={props.disabled}
            id="polis-new-password"
            name="new-password"
            onChange={(e) => props.onPasswordChange(e.target.value)}
            placeholder={`At least ${POLIS_MIN_PASSWORD_LENGTH} characters`}
            spellCheck={false}
            type={passwordVisible ? "text" : "password"}
            value={props.password}
          />
          <button
            aria-label={passwordVisible ? "Hide password" : "Show password"}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-zinc-400 transition-colors hover:text-zinc-200 polis-focus"
            disabled={props.disabled}
            onClick={() => setPasswordVisible((v) => !v)}
            type="button"
          >
            {passwordVisible ? (
              <EyeOff aria-hidden className="h-4 w-4" />
            ) : (
              <Eye aria-hidden className="h-4 w-4" />
            )}
          </button>
        </div>
        <PasswordStrengthMeter password={props.password} />
      </label>
      <label className="block">
        <span className="mb-1.5 block text-sm text-zinc-300">Confirm password</span>
        <div className="relative">
          <input
            autoComplete="new-password"
            className="polis-input pr-10"
            disabled={props.disabled}
            id="polis-confirm-password"
            name="confirm-password"
            onChange={(e) => props.onConfirmChange(e.target.value)}
            placeholder="Repeat password"
            spellCheck={false}
            type={confirmVisible ? "text" : "password"}
            value={props.confirm}
          />
          <button
            aria-label={confirmVisible ? "Hide confirmation" : "Show confirmation"}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-zinc-400 transition-colors hover:text-zinc-200 polis-focus"
            disabled={props.disabled}
            onClick={() => setConfirmVisible((v) => !v)}
            type="button"
          >
            {confirmVisible ? (
              <EyeOff aria-hidden className="h-4 w-4" />
            ) : (
              <Eye aria-hidden className="h-4 w-4" />
            )}
          </button>
        </div>
      </label>
    </div>
  );
}
