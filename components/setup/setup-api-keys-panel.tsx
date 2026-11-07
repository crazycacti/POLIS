"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";

import type { ApiKeyProvider, ApiKeyValidateResult } from "@/lib/api-key-validate";
import { inferTmdbCredentialParams } from "@/lib/tmdb-credential-infer";
import { parseTvdbCredentials } from "@/lib/tvdb-credentials";

type ApiKeyRowDef = {
  id: ApiKeyProvider;
  label: string;
  href: string;
  placeholder: string;
};

const REQUIRED_KEYS: ApiKeyRowDef[] = [
  {
    id: "tmdb",
    label: "TMDB",
    href: "https://www.themoviedb.org/settings/api",
    placeholder: "v3 API key or read access token",
  },
  {
    id: "mdblist",
    label: "MDBList",
    href: "https://mdblist.com/preferences/",
    placeholder: "MDBList API key",
  },
];

const OPTIONAL_KEYS: ApiKeyRowDef[] = [
  {
    id: "fanart",
    label: "Fanart.tv",
    href: "https://fanart.tv/get-an-api-key/",
    placeholder: "Fanart.tv API key",
  },
  {
    id: "tvdb",
    label: "TheTVDB",
    href: "https://thetvdb.com/api-information",
    placeholder: "API key or key:pin",
  },
];

const MASK_VISIBLE_CHARS = 4;
const MASK_MIN_LENGTH = MASK_VISIBLE_CHARS * 2;
const MASK_DOTS = "••••";

export type ApiKeyRowSource = {
  browserValue: string;
  hasServer: boolean;
  hasProfile: boolean;
};

type Validation =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "rejected"; message: string };

function maskedKey(id: ApiKeyProvider, value: string): string {
  const visible = id === "tvdb" ? (parseTvdbCredentials(value)?.apiKey ?? value) : value;
  if (visible.length < MASK_MIN_LENGTH) return "Saved";
  return `Saved ${MASK_DOTS}${visible.slice(-MASK_VISIBLE_CHARS)}`;
}

function ApiKeyInput(props: {
  id: ApiKeyProvider;
  label: string;
  placeholder: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const [visible, setVisible] = useState(false);
  const inputId = `polis-api-key-${props.id}`;

  return (
    <div className="relative min-w-0 flex-1">
      <input
        aria-label={`${props.label} key`}
        autoComplete="off"
        autoFocus
        className="polis-input w-full pr-12 font-mono"
        disabled={props.disabled}
        id={inputId}
        onChange={(e) => props.onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") props.onSubmit();
          if (e.key === "Escape") props.onCancel();
        }}
        placeholder={props.placeholder}
        spellCheck={false}
        type={visible ? "text" : "password"}
        value={props.value}
      />
      <button
        aria-controls={inputId}
        aria-label={visible ? "Hide API key" : "Show API key"}
        aria-pressed={visible}
        className="polis-icon-btn absolute right-0.5 top-1/2 h-10 w-10 -translate-y-1/2"
        onClick={() => setVisible((v) => !v)}
        type="button"
      >
        {visible ? <EyeOff aria-hidden className="h-4 w-4" /> : <Eye aria-hidden className="h-4 w-4" />}
      </button>
    </div>
  );
}

function ApiKeyRow(props: {
  def: ApiKeyRowDef;
  source: ApiKeyRowSource;
  onSave: (id: ApiKeyProvider, value: string) => void;
  onRemove: (id: ApiKeyProvider) => void;
}) {
  const { def, source } = props;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [validation, setValidation] = useState<Validation>({ state: "idle" });
  const [notice, setNotice] = useState<string | null>(null);

  const browserValue = source.browserValue.trim();
  const serverOnly = source.hasServer && def.id !== "mdblist";
  const trimmedDraft = draft.trim();
  const checking = validation.state === "checking";
  const draftSaved = trimmedDraft !== "" && trimmedDraft === browserValue;
  const canSave = trimmedDraft !== "" && !draftSaved && !checking;
  const canRemove = browserValue !== "" || (source.hasProfile && !serverOnly);

  const statusLabel = checking
    ? "Checking"
    : validation.state === "rejected"
      ? "Rejected"
      : serverOnly
        ? "Using the server key"
        : browserValue
          ? maskedKey(def.id, browserValue)
          : source.hasProfile
            ? "Saved to profile"
            : source.hasServer
              ? "Using the server key"
              : "Not set";
  const statusTone =
    validation.state === "rejected"
      ? "text-amber-200/95"
      : browserValue || source.hasProfile || source.hasServer
        ? "text-zinc-300"
        : "text-zinc-500";

  function openEditor() {
    setDraft("");
    setValidation({ state: "idle" });
    setNotice(null);
    setEditing(true);
  }

  function closeEditor() {
    setDraft("");
    setValidation({ state: "idle" });
    setEditing(false);
  }

  async function save() {
    if (!canSave) return;
    if (def.id === "tmdb") {
      const inferred = inferTmdbCredentialParams(trimmedDraft);
      if (inferred.error) {
        setValidation({ state: "rejected", message: inferred.error });
        return;
      }
    }
    setValidation({ state: "checking" });
    try {
      const res = await fetch("/api/keys/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: def.id, key: trimmedDraft }),
      });
      const data = (await res.json()) as Partial<ApiKeyValidateResult>;
      if (!data.ok) {
        setValidation({ state: "rejected", message: data.message ?? "This key was not accepted." });
        return;
      }
      props.onSave(def.id, trimmedDraft);
      setNotice(data.limited && data.message ? data.message : null);
      closeEditor();
    } catch {
      setValidation({ state: "rejected", message: "Could not check the key. Try again." });
    }
  }

  function remove() {
    setNotice(null);
    closeEditor();
    props.onRemove(def.id);
  }

  return (
    <li className="py-4">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-zinc-100">{def.label}</p>
          <p className={`text-sm ${statusTone}`} role="status">
            {statusLabel}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a
            className="inline-flex min-h-10 items-center rounded-full px-3 text-xs text-cyan-400/90 underline-offset-2 hover:text-cyan-300 hover:underline polis-focus"
            href={def.href}
            rel="noopener noreferrer"
            target="_blank"
          >
            Get a key
          </a>
          {!editing && !serverOnly ? (
            <button className="polis-btn-secondary" onClick={openEditor} type="button">
              {browserValue || source.hasProfile ? "Replace" : "Add key"}
            </button>
          ) : null}
          {!editing && canRemove ? (
            <button className="polis-btn-secondary" onClick={remove} type="button">
              Remove
            </button>
          ) : null}
        </div>
      </div>

      {editing ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <ApiKeyInput
            disabled={checking}
            id={def.id}
            label={def.label}
            onCancel={closeEditor}
            onChange={(value) => {
              setDraft(value);
              if (validation.state === "rejected") setValidation({ state: "idle" });
            }}
            onSubmit={() => void save()}
            placeholder={def.placeholder}
            value={draft}
          />
          <button className="polis-btn-secondary" disabled={!canSave} onClick={() => void save()} type="button">
            {checking ? "Checking" : draftSaved ? "Saved" : "Save"}
          </button>
          <button className="polis-btn-secondary" disabled={checking} onClick={closeEditor} type="button">
            Cancel
          </button>
        </div>
      ) : null}

      {validation.state === "rejected" ? (
        <p className="mt-2 text-sm text-amber-200/95" role="alert">
          {validation.message}
        </p>
      ) : null}
      {notice && !editing ? (
        <p className="mt-2 text-sm text-zinc-400" role="status">
          {notice}
        </p>
      ) : null}
    </li>
  );
}

function ApiKeyGroup(props: {
  title: string;
  rows: ApiKeyRowDef[];
  keys: Record<ApiKeyProvider, ApiKeyRowSource>;
  onSave: (id: ApiKeyProvider, value: string) => void;
  onRemove: (id: ApiKeyProvider) => void;
}) {
  const headingId = `api-keys-${props.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <section aria-labelledby={headingId} className="mb-8">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400" id={headingId}>
        {props.title}
      </h3>
      <ul className="divide-y divide-white/5">
        {props.rows.map((def) => (
          <ApiKeyRow
            def={def}
            key={def.id}
            onRemove={props.onRemove}
            onSave={props.onSave}
            source={props.keys[def.id]}
          />
        ))}
      </ul>
    </section>
  );
}

export function SetupApiKeysPanel(props: {
  keys: Record<ApiKeyProvider, ApiKeyRowSource>;
  onSave: (id: ApiKeyProvider, value: string) => void;
  onRemove: (id: ApiKeyProvider) => void;
}) {
  return (
    <section aria-labelledby="api-keys-heading" className="mb-10">
      <h2 className="mb-4 text-lg font-semibold text-white" id="api-keys-heading">
        API keys
      </h2>
      <ApiKeyGroup
        keys={props.keys}
        onRemove={props.onRemove}
        onSave={props.onSave}
        rows={REQUIRED_KEYS}
        title="Required"
      />
      <ApiKeyGroup
        keys={props.keys}
        onRemove={props.onRemove}
        onSave={props.onSave}
        rows={OPTIONAL_KEYS}
        title="Optional art sources"
      />
    </section>
  );
}
