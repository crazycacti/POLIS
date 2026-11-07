"use client";

import { useEffect, useId, useRef, useState } from "react";

import { SetupPasswordFields } from "@/components/setup/setup-password-fields";
import { validateNewPasswordPair } from "@/lib/polis-config-auth-constants";

export function SetupPasswordDialog(props: {
  open: boolean;
  saving: boolean;
  isNewProfile: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: (password: string, passwordConfirm: string) => void;
  username: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!props.open) return;
    setPassword("");
    setConfirm("");
    setLocalError(null);
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.querySelector<HTMLInputElement>("input[name='new-password']")?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      returnFocusRef.current?.focus();
    };
  }, [props.open]);

  function keepFocusInside(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      handleClose();
      return;
    }
    if (e.key !== "Tab" || !panelRef.current) return;
    const focusable = [
      ...panelRef.current.querySelectorAll<HTMLElement>("input:not([tabindex='-1']), button"),
    ].filter((el) => !el.hasAttribute("disabled"));
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first || !last) return;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  function handleClose() {
    if (props.saving) return;
    props.onClose();
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const filledPassword = String(form.get("new-password") ?? password);
    const filledConfirm = String(form.get("confirm-password") ?? confirm);
    setPassword(filledPassword);
    setConfirm(filledConfirm);
    const validated = validateNewPasswordPair(filledPassword, filledConfirm);
    if (!validated.ok) {
      setLocalError(validated.error);
      return;
    }
    setLocalError(null);
    props.onConfirm(validated.password, validated.password);
  }

  const displayError = localError ?? props.error;

  if (!props.open) return null;

  // Not a modal <dialog>: showModal makes everything outside it inert, which blocks password manager menus.
  return (
    <div className="polis-overlay" role="presentation">
      <div
        aria-labelledby={titleId}
        aria-modal="true"
        className="w-full max-w-md"
        onKeyDown={keepFocusInside}
        ref={panelRef}
        role="dialog"
      >
      <form className="polis-dialog-panel" onSubmit={handleSubmit}>
        <h2 className="text-lg font-semibold text-white" id={titleId}>
          {props.isNewProfile ? "Protect your profile" : "Set a profile password"}
        </h2>
        <p className="mt-2 text-sm text-zinc-400">
          {props.isNewProfile
            ? "Choose a password before saving. You will use it to open configure again later."
            : "This profile has no password yet. Set one so only you can change it."}
        </p>
        <div className="mt-5">
          <SetupPasswordFields
            username={props.username}
            confirm={confirm}
            disabled={props.saving}
            onConfirmChange={setConfirm}
            onPasswordChange={setPassword}
            password={password}
          />
        </div>
        {displayError ? (
          <p className="mt-3 text-sm text-amber-200/95" role="alert">
            {displayError}
          </p>
        ) : null}
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button
            className="polis-btn-secondary"
            disabled={props.saving}
            onClick={handleClose}
            type="button"
          >
            Cancel
          </button>
          <button className="polis-btn" disabled={props.saving} type="submit">
            {props.saving ? "Saving…" : "Save profile"}
          </button>
        </div>
      </form>
      </div>
    </div>
  );
}
