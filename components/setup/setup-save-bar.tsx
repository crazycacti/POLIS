"use client";

import { useId, useState } from "react";

import { CopyButton } from "@/components/copy-button";
import { SetupDialog, SetupDialogCancel } from "@/components/setup/setup-dialog";
import { PatternRow } from "@/components/setup/setup-ui";

export type SetupSaveStatus = "dirty" | "saved" | "saving";

const HTTPS_SCHEME = /^https:\/\//i;
const STREMIO_WEB_ADDONS_URL = "https://web.stremio.com/#/addons?addon=";

function stremioDeepLink(installUrl: string): string | null {
  return HTTPS_SCHEME.test(installUrl) ? installUrl.replace(HTTPS_SCHEME, "stremio://") : null;
}

const STATUS_LABEL: Record<SetupSaveStatus, string> = {
  dirty: "Unsaved changes",
  saved: "Saved",
  saving: "Saving",
};

const STATUS_DOT: Record<SetupSaveStatus, string> = {
  dirty: "bg-amber-400",
  saved: "bg-emerald-400",
  saving: "bg-zinc-400 motion-safe:animate-pulse",
};

export function SetupSaveBar(props: {
  status: SetupSaveStatus;
  error: string | null;
  lockReason: string | null;
  lockAction: { label: string; onClick: () => void } | null;
  installUrl: string | null;
  posterPattern: string | null;
  landscapePattern: string | null;
  saveLabel: string;
  saving: boolean;
  onSave: () => void;
}) {
  const [optionsOpen, setOptionsOpen] = useState(false);
  const reasonId = useId();
  const locked = Boolean(props.lockReason);
  const deepLink = props.installUrl ? stremioDeepLink(props.installUrl) : null;

  return (
    <div className="sticky bottom-0 z-30 -mx-4 mt-10 border-t border-white/10 bg-zinc-950/80 px-4 backdrop-blur-md sm:-mx-6 sm:px-6">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <div className="flex min-w-0 flex-1 basis-full items-center gap-2 text-sm sm:basis-48">
          {props.error ? (
            <p className="min-w-0 text-amber-200/95" role="alert">
              {props.error}
            </p>
          ) : null}
          <p
            aria-live="polite"
            className={`flex min-w-0 items-center gap-2 text-zinc-300 ${props.error ? "sr-only" : ""}`}
            role="status"
          >
            {locked ? (
              <span className="text-amber-100/95" id={reasonId}>
                {props.lockReason}
              </span>
            ) : (
              <>
                <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[props.status]}`} />
                {STATUS_LABEL[props.status]}
              </>
            )}
          </p>
          {locked && props.lockAction && !props.error ? (
            <button
              className="polis-link-btn shrink-0 pointer-coarse:min-h-11"
              onClick={props.lockAction.onClick}
              type="button"
            >
              {props.lockAction.label}
            </button>
          ) : null}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button
            className="polis-btn-secondary pointer-coarse:min-h-11"
            onClick={() => setOptionsOpen(true)}
            type="button"
          >
            <span className="sm:hidden">More</span>
            <span className="hidden sm:inline">More install options</span>
          </button>
          {props.installUrl ? (
            <div className="hidden items-center gap-2 sm:flex">
              <CopyButton label="Copy URL" text={props.installUrl} />
              {deepLink ? (
                <a className="polis-btn-secondary" href={deepLink}>
                  Install in Stremio
                </a>
              ) : null}
            </div>
          ) : null}
          <button
            aria-describedby={locked ? reasonId : undefined}
            aria-disabled={locked ? true : undefined}
            className="polis-btn pointer-coarse:min-h-11 aria-disabled:cursor-not-allowed aria-disabled:opacity-50 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={props.saving}
            onClick={() => {
              if (!locked) props.onSave();
            }}
            type="button"
          >
            {props.saveLabel}
          </button>
        </div>
      </div>

      <SetupDialog
        actions={<SetupDialogCancel label="Close" onClick={() => setOptionsOpen(false)} />}
        onClose={() => setOptionsOpen(false)}
        open={optionsOpen}
        title="Install options"
        wide
      >
        <div className="space-y-6">
          {props.installUrl ? (
            <div className="space-y-3">
              <div>
                <p className="mb-1.5 text-sm text-zinc-300">Install URL</p>
                <div className="polis-code flex flex-wrap items-center justify-between gap-3">
                  <code className="break-all text-xs text-zinc-300">{props.installUrl}</code>
                  <CopyButton text={props.installUrl} />
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {deepLink ? (
                  <a className="polis-btn-secondary" href={deepLink}>
                    Install in Stremio
                  </a>
                ) : null}
                <a
                  className="polis-btn-secondary"
                  href={`${STREMIO_WEB_ADDONS_URL}${encodeURIComponent(props.installUrl)}`}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  Open in Stremio Web
                </a>
              </div>
            </div>
          ) : (
            <p className="text-sm text-zinc-400">Save the profile to get an install URL.</p>
          )}

          <section aria-labelledby={`${reasonId}-aio`}>
            <h3 className="text-sm font-semibold text-zinc-200" id={`${reasonId}-aio`}>
              AIOMetadata
            </h3>
            {props.posterPattern ? (
              <div className="mt-3 space-y-3">
                <PatternRow label="customPosterUrlPattern" value={props.posterPattern} />
                {props.landscapePattern ? (
                  <PatternRow label="customLandscapeUrlPattern" value={props.landscapePattern} />
                ) : null}
              </div>
            ) : (
              <p className="mt-3 text-sm text-zinc-400">Set POLIS_PUBLIC_URL first.</p>
            )}
          </section>
        </div>
      </SetupDialog>
    </div>
  );
}
