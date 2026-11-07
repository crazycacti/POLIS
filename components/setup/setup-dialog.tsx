"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

export function SetupDialog(props: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  actions: ReactNode;
  wide?: boolean;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (props.open && !dialog.open) dialog.showModal();
    if (!props.open && dialog.open) dialog.close();
  }, [props.open]);

  return (
    <dialog
      aria-labelledby={titleId}
      className="polis-dialog"
      onCancel={(e) => {
        e.preventDefault();
        props.onClose();
      }}
      onClose={() => {
        if (props.open) props.onClose();
      }}
      ref={dialogRef}
    >
      <div className={`polis-dialog-panel ${props.wide ? "sm:min-w-[36rem] sm:max-w-2xl" : ""}`}>
        <h2 className="text-lg font-semibold text-white" id={titleId}>{props.title}</h2>
        <div className="mt-4">{props.children}</div>
        <div className="mt-6 flex flex-wrap justify-end gap-2">{props.actions}</div>
      </div>
    </dialog>
  );
}

export function SetupDialogCancel(props: { label?: string; onClick: () => void }) {
  return (
    <button
      className="polis-btn-secondary"
      onClick={props.onClick}
      type="button"
    >
      {props.label ?? "Cancel"}
    </button>
  );
}
