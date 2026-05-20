"use client";

import { Eye, EyeOff } from "lucide-react";
import { useCallback, useState } from "react";

import type { ApiKeyProvider } from "@/lib/api-key-validate";
import { inferTmdbCredentialParams } from "@/lib/tmdb-credential-infer";

export type ApiKeyCardDef = {
  id: ApiKeyProvider;
  label: string;
  href: string;
  hrefLabel: string;
  placeholder: string;
  envVar: string;
  required: boolean;
  requiredNote?: string;
};

export const API_KEY_CARDS: ApiKeyCardDef[] = [
  {
    id: "tmdb",
    label: "TMDB",
    href: "https://www.themoviedb.org/settings/api",
    hrefLabel: "themoviedb.org/settings/api",
    placeholder: "v3 API key or read access token",
    envVar: "TMDB_ACCESS_TOKEN or TMDB_API_KEY",
    required: true,
    requiredNote: "Posters, genres, and IMDb to TMDB mapping",
  },
  {
    id: "mdblist",
    label: "MDBList",
    href: "https://mdblist.com/preferences/",
    hrefLabel: "mdblist.com/preferences",
    placeholder: "MDBList API key",
    envVar: "MDBLIST_API_KEY",
    required: true,
    requiredNote:
      "RT, Metacritic, Letterboxd, trend tags, 4K/Dolby/HDR marks, and age (not available from TMDB)",
  },
  {
    id: "fanart",
    label: "Fanart.tv",
    href: "https://fanart.tv/get-an-api-key/",
    hrefLabel: "fanart.tv/get-an-api-key",
    placeholder: "Fanart.tv API key",
    envVar: "FANART_API_KEY",
    required: false,
  },
  {
    id: "tvdb",
    label: "TheTVDB",
    href: "https://thetvdb.com/api-information",
    hrefLabel: "thetvdb.com/api-information",
    placeholder: "TheTVDB API key",
    envVar: "TVDB_API_KEY",
    required: false,
  },
];

type KeyStatus = "idle" | "checking" | "valid" | "invalid";

type StatusMap = Partial<Record<ApiKeyProvider, { state: KeyStatus; message: string }>>;

function ApiKeyInput(props: {
  disabled: boolean;
  id: ApiKeyProvider;
  onChange: (value: string) => void;
  placeholder: string;
  value: string;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative mb-2">
      <input
        autoComplete="off"
        className="polis-input pr-10 font-mono disabled:cursor-not-allowed disabled:opacity-50"
        disabled={props.disabled}
        id={`polis-api-key-${props.id}`}
        onChange={(e) => props.onChange(e.target.value)}
        placeholder={props.placeholder}
        spellCheck={false}
        type={visible ? "text" : "password"}
        value={props.value}
      />
      <button
        aria-controls={`polis-api-key-${props.id}`}
        aria-label={visible ? "Hide API key" : "Show API key"}
        aria-pressed={visible}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-zinc-500 transition-colors hover:text-zinc-200 disabled:pointer-events-none disabled:opacity-40"
        disabled={props.disabled}
        onClick={() => setVisible((v) => !v)}
        type="button"
      >
        {visible ? (
          <EyeOff aria-hidden className="h-4 w-4" />
        ) : (
          <Eye aria-hidden className="h-4 w-4" />
        )}
      </button>
    </div>
  );
}

export function SetupApiKeysPanel(props: {
  hasServerTmdb: boolean;
  hasServerMdblist: boolean;
  hasServerFanart: boolean;
  hasServerTvdb: boolean;
  tmdbValue: string;
  mdblistValue: string;
  fanartValue: string;
  tvdbValue: string;
  onTmdbChange: (value: string) => void;
  onMdblistChange: (value: string) => void;
  onFanartChange: (value: string) => void;
  onTvdbChange: (value: string) => void;
  onTmdbSave: () => void;
  onMdblistSave: () => void;
  onFanartSave: () => void;
  onTvdbSave: () => void;
  onTmdbClear: () => void;
  onMdblistClear: () => void;
  onFanartClear: () => void;
  onTvdbClear: () => void;
}) {
  const [status, setStatus] = useState<StatusMap>({});

  const envConfigured = useCallback(
    (id: ApiKeyProvider): boolean => {
      if (id === "tmdb") return props.hasServerTmdb;
      if (id === "mdblist") return props.hasServerMdblist;
      if (id === "fanart") return props.hasServerFanart;
      return props.hasServerTvdb;
    },
    [props.hasServerFanart, props.hasServerMdblist, props.hasServerTmdb, props.hasServerTvdb],
  );

  const valueFor = (id: ApiKeyProvider): string => {
    if (id === "tmdb") return props.tmdbValue;
    if (id === "mdblist") return props.mdblistValue;
    if (id === "fanart") return props.fanartValue;
    return props.tvdbValue;
  };

  const onChangeFor = (id: ApiKeyProvider) => (value: string) => {
    if (id === "tmdb") props.onTmdbChange(value);
    else if (id === "mdblist") props.onMdblistChange(value);
    else if (id === "fanart") props.onFanartChange(value);
    else props.onTvdbChange(value);
    setStatus((s) => {
      const next = { ...s };
      delete next[id];
      return next;
    });
  };

  const clearFor = (id: ApiKeyProvider) => {
    if (id === "tmdb") props.onTmdbClear();
    else if (id === "mdblist") props.onMdblistClear();
    else if (id === "fanart") props.onFanartClear();
    else props.onTvdbClear();
    setStatus((s) => {
      const next = { ...s };
      delete next[id];
      return next;
    });
  };

  const saveFor = (id: ApiKeyProvider) => {
    if (id === "tmdb") props.onTmdbSave();
    else if (id === "mdblist") props.onMdblistSave();
    else if (id === "fanart") props.onFanartSave();
    else props.onTvdbSave();
  };

  const validateKey = async (id: ApiKeyProvider) => {
    const raw = valueFor(id).trim();
    if (id === "tmdb") {
      const inferred = inferTmdbCredentialParams(raw);
      if (inferred.error) {
        setStatus({ [id]: { state: "invalid", message: inferred.error } });
        return;
      }
    }
    if (!raw) {
      setStatus({ [id]: { state: "invalid", message: "Enter a key first." } });
      return;
    }

    setStatus({ [id]: { state: "checking", message: "Checking key…" } });
    try {
      const res = await fetch("/api/keys/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: id, key: raw }),
      });
      const data = (await res.json()) as { ok?: boolean; message?: string };
      setStatus({
        [id]: {
          state: data.ok ? "valid" : "invalid",
          message: data.message ?? (data.ok ? "Valid." : "Invalid."),
        },
      });
      if (data.ok) saveFor(id);
    } catch {
      setStatus({ [id]: { state: "invalid", message: "Validation request failed." } });
    }
  };

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {API_KEY_CARDS.map((card) => {
        const server = envConfigured(card.id);
        const value = valueFor(card.id);
        const st = status[card.id];
        const inputDisabled = server;

        return (
          <div
            className="rounded-xl border border-zinc-800/80 bg-zinc-950/60 p-4"
            key={card.id}
          >
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-medium text-zinc-200">{card.label}</span>
              <div className="flex flex-wrap items-center gap-1.5">
                {card.required ? (
                  <span className="rounded-full border border-amber-500/35 bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-medium text-amber-200/95">
                    Required
                  </span>
                ) : null}
                {server ? (
                  <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-0.5 text-[11px] font-medium text-cyan-300/95">
                    Configured on server
                  </span>
                ) : null}
              </div>
            </div>

            {card.requiredNote ? (
              <p className="mb-2 text-xs text-zinc-500">{card.requiredNote}</p>
            ) : null}

            <ApiKeyInput
              disabled={inputDisabled}
              id={card.id}
              onChange={onChangeFor(card.id)}
              placeholder={card.placeholder}
              value={inputDisabled ? "" : value}
            />

            {!inputDisabled ? (
              <div className="mb-2 flex flex-wrap gap-2">
                <button
                  className="polis-btn text-xs"
                  disabled={st?.state === "checking"}
                  onClick={() => validateKey(card.id)}
                  type="button"
                >
                  {st?.state === "checking" ? "Checking…" : "Save and validate"}
                </button>
                {value.trim() ? (
                  <button
                    className="rounded-full border border-zinc-700 px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200"
                    onClick={() => clearFor(card.id)}
                    type="button"
                  >
                    Clear
                  </button>
                ) : null}
              </div>
            ) : (
              <p className="mb-2 text-xs text-zinc-500">
                Or set <code className="text-zinc-400">{card.envVar}</code> on the server.
              </p>
            )}

            {st && st.state !== "idle" ? (
              <p
                className={
                  st.state === "valid"
                    ? "mb-2 text-xs text-emerald-400/95"
                    : st.state === "checking"
                      ? "mb-2 text-xs text-zinc-400"
                      : "mb-2 text-xs text-amber-200/95"
                }
              >
                {st.message}
              </p>
            ) : null}

            <p className="text-xs text-zinc-600">
              <a
                className="text-cyan-500/90 underline underline-offset-2 hover:text-cyan-400"
                href={card.href}
                rel="noopener noreferrer"
                target="_blank"
              >
                {card.hrefLabel}
              </a>
            </p>
          </div>
        );
      })}
    </div>
  );
}
