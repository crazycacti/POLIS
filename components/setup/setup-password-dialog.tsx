"use client";

import { useEffect, useRef, useState } from "react";

import { SetupPasswordFields } from "@/components/setup/setup-password-fields";
import { validateNewPasswordPair } from "@/lib/polis-config-auth-constants";

export function SetupPasswordDialog(props: {
  open: boolean;
  saving: boolean;
  isNewProfile: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: (password: string, passwordConfirm: string) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (props.open && !dialog.open) {
      dialog.showModal();
      setPassword("");
      setConfirm("");
      setLocalError(null);
    }
    if (!props.open && dialog.open) {
      dialog.close();
    }
  }, [props.open]);

  function handleClose() {
    if (props.saving) return;
    props.onClose();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const validated = validateNewPasswordPair(password, confirm);
    if (!validated.ok) {
      setLocalError(validated.error);
      return;
    }
    setLocalError(null);
    props.onConfirm(validated.password, validated.password);
  }

  const displayError = localError ?? props.error;

  return (
    <dialog
      className="polis-dialog"
      onCancel={(e) => {
        e.preventDefault();
        handleClose();
      }}
      onClose={handleClose}
      ref={dialogRef}
    >
      <form className="polis-dialog-panel" onSubmit={handleSubmit}>
        <h2 className="text-lg font-semibold text-white">
          {props.isNewProfile ? "Protect your profile" : "Set a profile password"}
        </h2>
        <p className="mt-2 text-sm text-zinc-500">
          {props.isNewProfile
            ? "Choose a password before saving. You will use it to open configure again later."
            : "This profile has no password yet. Set one so only you can change it."}
        </p>
        <div className="mt-5">
          <SetupPasswordFields
            confirm={confirm}
            disabled={props.saving}
            onConfirmChange={setConfirm}
            onPasswordChange={setPassword}
            password={password}
          />
        </div>
        {displayError ? (
          <p className="mt-3 text-sm text-amber-200/95">{displayError}</p>
        ) : null}
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button
            className="rounded-full border border-zinc-700 px-4 py-2 text-sm text-zinc-300 transition-colors hover:border-zinc-500 hover:text-white"
            disabled={props.saving}
            onClick={handleClose}
            type="button"
          >
            Cancel
          </button>
          <button className="polis-btn text-sm" disabled={props.saving} type="submit">
            {props.saving ? "Saving…" : "Save profile"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
