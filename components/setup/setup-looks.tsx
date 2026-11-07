"use client";

import { Plus, SlidersHorizontal, X } from "lucide-react";
import { useEffect, useState } from "react";

import { CopyButton } from "@/components/copy-button";
import { SetupDialog, SetupDialogCancel } from "@/components/setup/setup-dialog";
import { SetupMenu } from "@/components/setup/setup-menu";
import { SelectionCheck } from "@/components/setup/setup-ui";
import { DEMO_TITLES } from "@/lib/demo-catalog";
import { demoPosterThumbPath } from "@/lib/demo-poster-urls";
import {
  applyLookFields,
  decodeLookCode,
  encodeLookCode,
  lookShareUrl,
  lookToJson,
  parseLookJson,
  rejectedLookFields,
} from "@/lib/poster-look-code";
import { applyStarterLook, matchesStarterLook, STARTER_LOOKS } from "@/lib/poster-looks";
import { serializePosterQuery, type PosterOverlayQuery } from "@/lib/poster-query";
import { PREVIEW_SMALL_THUMB_WIDTH, previewThumbSrcSet } from "@/lib/preview-sizes";

const LOOK_PREVIEW_DEMO_ID = DEMO_TITLES[0]!.id;
const LOOK_TILE_SIZES = "132px";
const LS_MY_LOOKS = "polis_my_looks";
const MAX_SAVED_LOOKS = 12;
const MAX_LOOK_NAME_LENGTH = 40;

type SavedLook = { id: string; name: string; code: string };
type LookDialog = "save" | "share" | "import" | "json" | null;

function readSavedLooks(): SavedLook[] {
  try {
    const raw = localStorage.getItem(LS_MY_LOOKS);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (row): row is SavedLook =>
          Boolean(row) &&
          typeof row.id === "string" &&
          typeof row.name === "string" &&
          typeof row.code === "string" &&
          decodeLookCode(row.code) != null,
      )
      .slice(0, MAX_SAVED_LOOKS);
  } catch {
    return [];
  }
}

function writeSavedLooks(looks: SavedLook[]): boolean {
  try {
    localStorage.setItem(LS_MY_LOOKS, JSON.stringify(looks));
    return true;
  } catch {
    return false;
  }
}

function LookTile(props: {
  label: string;
  preview: PosterOverlayQuery;
  selected: boolean;
  onSelect: () => void;
  onRemove?: () => void;
}) {
  const query = serializePosterQuery(props.preview);
  return (
    <div className="relative">
      <button
        aria-pressed={props.selected}
        className="polis-focus group flex w-full flex-col gap-2 rounded-lg p-1.5 text-left"
        onClick={props.onSelect}
        type="button"
      >
        <span className="relative block">
          <img
            alt=""
            className={`${props.preview.posterShape === "landscape" ? "aspect-video" : "aspect-2/3"} w-full rounded-md object-cover ${props.selected ? "ring-2 ring-cyan-400" : ""}`}
            decoding="async"
            height={198}
            loading="lazy"
            sizes={LOOK_TILE_SIZES}
            src={demoPosterThumbPath(LOOK_PREVIEW_DEMO_ID, query, PREVIEW_SMALL_THUMB_WIDTH)}
            srcSet={previewThumbSrcSet((width) => demoPosterThumbPath(LOOK_PREVIEW_DEMO_ID, query, width))}
            width={132}
          />
          {props.selected ? <SelectionCheck /> : null}
        </span>
        <span
          className={`truncate px-0.5 text-sm ${props.selected ? "text-white" : "text-zinc-400 group-hover:text-zinc-200"}`}
        >
          {props.label}
        </span>
      </button>
      {props.onRemove ? (
        <button
          aria-label={`Remove ${props.label}`}
          className="absolute right-0 top-0 flex h-8 w-8 items-center justify-center rounded-full bg-black/70 text-zinc-300 hover:text-white"
          onClick={props.onRemove}
          type="button"
        >
          <X aria-hidden className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
}

export function SetupLooks(props: {
  overlay: PosterOverlayQuery;
  previewOverlay: PosterOverlayQuery;
  onChange: (overlay: PosterOverlayQuery) => void;
  origin: string;
  initialLookCode: string | null;
  onLookLinkConsumed: () => void;
  onReset: () => void;
  resetDisabled: boolean;
}) {
  const { overlay, previewOverlay, onChange, onLookLinkConsumed } = props;
  const [saved, setSaved] = useState<SavedLook[]>([]);
  const [dialog, setDialog] = useState<LookDialog>(null);
  const [name, setName] = useState("");
  const [importText, setImportText] = useState("");
  const [jsonText, setJsonText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [linkNotice, setLinkNotice] = useState<{
    previous: PosterOverlayQuery;
    appliedCode: string;
  } | null>(null);

  useEffect(() => {
    setSaved(readSavedLooks());
    const onStorage = (event: StorageEvent) => {
      if (event.key === LS_MY_LOOKS) setSaved(readSavedLooks());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    if (!props.initialLookCode) return;
    const fields = decodeLookCode(props.initialLookCode);
    onLookLinkConsumed();
    if (!fields) {
      setError("That look link is not valid.");
      return;
    }
    const applied = applyLookFields(overlay, fields);
    setLinkNotice({ previous: overlay, appliedCode: encodeLookCode(applied) });
    onChange(applied);
  }, [onChange, onLookLinkConsumed, overlay, props.initialLookCode]);

  const currentCode = encodeLookCode(overlay);
  const showLinkNotice = linkNotice != null && linkNotice.appliedCode === currentCode;

  function closeDialog() {
    setError(null);
    setDialog(null);
  }

  function openDialog(next: LookDialog) {
    setError(null);
    if (next === "json") setJsonText(lookToJson(overlay));
    if (next === "import") setImportText("");
    if (next === "save") setName(`My look ${saved.length + 1}`);
    setDialog(next);
  }

  function saveCurrent() {
    const trimmed = name.trim().slice(0, MAX_LOOK_NAME_LENGTH);
    if (!trimmed) {
      setError("Give the look a name.");
      return;
    }
    const latest = readSavedLooks();
    if (latest.length >= MAX_SAVED_LOOKS) {
      setError(`You can keep up to ${MAX_SAVED_LOOKS} looks. Remove one first.`);
      return;
    }
    const next = [...latest, { id: crypto.randomUUID(), name: trimmed, code: currentCode }];
    if (!writeSavedLooks(next)) {
      setError("This browser blocked saving. Use Share to keep a link instead.");
      return;
    }
    setSaved(next);
    closeDialog();
  }

  function removeSaved(id: string) {
    const next = readSavedLooks().filter((look) => look.id !== id);
    if (!writeSavedLooks(next)) {
      setError("This browser blocked the change. Try again.");
      return;
    }
    setSaved(next);
  }

  function applyImport() {
    const fields = decodeLookCode(importText);
    if (!fields) {
      setError("Paste a look link or a code that starts with v1.");
      return;
    }
    onChange(applyLookFields(overlay, fields));
    closeDialog();
  }

  function applyJson() {
    const result = parseLookJson(jsonText);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const rejected = rejectedLookFields(overlay, result.fields);
    if (rejected.length > 0) {
      setError(`Value not allowed for ${rejected.join(", ")}. Use one the editor offers.`);
      return;
    }
    onChange(applyLookFields(overlay, result.fields));
    closeDialog();
  }

  return (
    <section aria-labelledby="looks-heading" className="mb-10">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-white" id="looks-heading">
          Look
        </h2>
        <SetupMenu
          icon={SlidersHorizontal}
          items={[
            { label: "Share link", onSelect: () => openDialog("share") },
            { label: "Import", onSelect: () => openDialog("import") },
            { label: "Edit as JSON", onSelect: () => openDialog("json") },
            {
              label: "Reset to defaults",
              onSelect: props.onReset,
              disabled: props.resetDisabled,
              dividerBefore: true,
            },
          ]}
          label="Look options"
        />
      </div>

      {showLinkNotice && linkNotice ? (
        <p className="mb-4 flex flex-wrap items-center gap-3 text-sm text-zinc-300" role="status">
          Look applied from a shared link. Save to keep it.
          <button
            className="polis-link-btn"
            onClick={() => {
              onChange(linkNotice.previous);
              setLinkNotice(null);
            }}
            type="button"
          >
            Undo
          </button>
        </p>
      ) : null}
      {error && !dialog ? (
        <p className="mb-4 text-sm text-amber-200/95" role="alert">
          {error}
        </p>
      ) : null}

      <div aria-labelledby="looks-heading" className="grid grid-cols-3 gap-3 sm:grid-cols-6" role="group">
        {STARTER_LOOKS.map((look) => (
          <LookTile
            key={look.id}
            label={look.label}
            onSelect={() => onChange(applyStarterLook(overlay, look))}
            preview={applyStarterLook(previewOverlay, look)}
            selected={matchesStarterLook(overlay, look)}
          />
        ))}
        {saved.map((look) => {
          const fields = decodeLookCode(look.code);
          if (!fields) return null;
          const applied = applyLookFields(overlay, fields);
          return (
            <LookTile
              key={look.id}
              label={look.name}
              onRemove={() => removeSaved(look.id)}
              onSelect={() => onChange(applied)}
              preview={applyLookFields(previewOverlay, fields)}
              selected={encodeLookCode(applied) === currentCode}
            />
          );
        })}
        {saved.length < MAX_SAVED_LOOKS ? (
          <button
            className={`flex ${overlay.posterShape === "landscape" ? "aspect-video" : "aspect-2/3"} flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-white/15 text-sm text-zinc-400 transition-colors hover:border-white/30 hover:text-white`}
            onClick={() => openDialog("save")}
            type="button"
          >
            <Plus aria-hidden className="h-5 w-5" />
            Save current
          </button>
        ) : null}
      </div>

      <SetupDialog
        actions={
          <>
            <SetupDialogCancel onClick={closeDialog} />
            <button className="polis-btn text-sm" onClick={saveCurrent} type="button">
              Save look
            </button>
          </>
        }
        onClose={closeDialog}
        open={dialog === "save"}
        title="Save this look"
      >
        <label className="block">
          <span className="mb-1.5 block text-sm text-zinc-300">Name</span>
          <input
            className="polis-input w-full text-sm"
            maxLength={MAX_LOOK_NAME_LENGTH}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveCurrent();
            }}
            value={name}
          />
        </label>
        <p className="mt-3 text-xs text-zinc-400">Saved in this browser.</p>
        {error ? (
          <p className="mt-3 text-sm text-amber-200/95" role="alert">
            {error}
          </p>
        ) : null}
      </SetupDialog>

      <SetupDialog
        actions={<SetupDialogCancel label="Close" onClick={closeDialog} />}
        onClose={closeDialog}
        open={dialog === "share"}
        title="Share this look"
        wide
      >
        {props.origin ? (
          <div className="polis-code flex flex-col gap-3">
            <code className="break-all text-xs text-zinc-300">{lookShareUrl(props.origin, overlay)}</code>
            <CopyButton className="self-end" text={lookShareUrl(props.origin, overlay)} />
          </div>
        ) : (
          <div className="polis-code flex flex-col gap-3">
            <code className="break-all text-xs text-zinc-300">{currentCode}</code>
            <CopyButton className="self-end" text={currentCode} />
          </div>
        )}
        <p className="mt-3 text-xs text-zinc-400">Style only. Keys, catalogs and passwords are never included.</p>
      </SetupDialog>

      <SetupDialog
        actions={
          <>
            <SetupDialogCancel onClick={closeDialog} />
            <button className="polis-btn text-sm" onClick={applyImport} type="button">
              Apply
            </button>
          </>
        }
        onClose={closeDialog}
        open={dialog === "import"}
        title="Import a look"
      >
        <label className="block">
          <span className="mb-1.5 block text-sm text-zinc-300">Look link or code</span>
          <input
            className="polis-input w-full font-mono text-xs"
            onChange={(e) => setImportText(e.target.value)}
            spellCheck={false}
            value={importText}
          />
        </label>
        {error ? (
          <p className="mt-3 text-sm text-amber-200/95" role="alert">
            {error}
          </p>
        ) : null}
      </SetupDialog>

      <SetupDialog
        actions={
          <>
            <SetupDialogCancel onClick={closeDialog} />
            <button className="polis-btn text-sm" onClick={applyJson} type="button">
              Apply
            </button>
          </>
        }
        onClose={closeDialog}
        open={dialog === "json"}
        title="Edit look as JSON"
        wide
      >
        <textarea
          aria-label="Look JSON"
          className="polis-input h-80 w-full resize-y font-mono text-xs leading-relaxed"
          onChange={(e) => setJsonText(e.target.value)}
          spellCheck={false}
          value={jsonText}
        />
        {error ? (
          <p className="mt-3 text-sm text-amber-200/95" role="alert">
            {error}
          </p>
        ) : null}
      </SetupDialog>
    </section>
  );
}
