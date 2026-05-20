"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { useCallback, useMemo, useState } from "react";

import { SetupPanel, SetupToggle } from "@/components/setup/setup-ui";
import { MDBLIST_WATCHLIST_PRESETS, TMDB_CATALOG_PRESETS } from "@/lib/catalog-presets";
import type { PolisCatalogDefinition } from "@/lib/polis-catalogs";
import {
  catalogDefinitionKey,
  mergeCatalogSelections,
  moveCatalogSelection,
  removeCatalogSelection,
} from "@/lib/polis-catalogs-json";
import {
  mdblistListToCatalogDefinitions,
  type MdblistListSummary,
} from "@/lib/mdblist-list-catalog";

function CatalogToggleRow(props: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  detail?: string;
}) {
  return (
    <div className="polis-catalog-toggle-row">
      <SetupToggle checked={props.checked} label={props.label} onChange={props.onChange} />
      {props.detail ? <p className="mt-1 pl-1 text-xs text-zinc-600">{props.detail}</p> : null}
    </div>
  );
}

export function SetupCatalogsPanel(props: {
  selected: PolisCatalogDefinition[];
  onChange: (next: PolisCatalogDefinition[]) => void;
  onApplyDefaults: () => void;
  defaultCount: number;
  hasTmdb: boolean;
  hasMdblist: boolean;
  mdblistApiKey: string | null;
}) {
  const [username, setUsername] = useState("snoak");
  const [search, setSearch] = useState("");
  const [remoteLists, setRemoteLists] = useState<MdblistListSummary[]>([]);
  const [discoverError, setDiscoverError] = useState<string | null>(null);
  const [discovering, setDiscovering] = useState(false);
  const selectedKeys = useMemo(
    () => new Set(props.selected.map(catalogDefinitionKey)),
    [props.selected],
  );

  const togglePreset = useCallback(
    (def: PolisCatalogDefinition, on: boolean) => {
      const key = catalogDefinitionKey(def);
      if (on) {
        props.onChange(mergeCatalogSelections(props.selected, [def]));
      } else {
        props.onChange(removeCatalogSelection(props.selected, key));
      }
    },
    [props.onChange, props.selected],
  );

  const toggleMdblistList = useCallback(
    (list: MdblistListSummary, on: boolean) => {
      const defs = mdblistListToCatalogDefinitions(list);
      if (on) {
        props.onChange(mergeCatalogSelections(props.selected, defs));
      } else {
        let next = props.selected;
        for (const def of defs) {
          next = removeCatalogSelection(next, catalogDefinitionKey(def));
        }
        props.onChange(next);
      }
    },
    [props.onChange, props.selected],
  );

  async function discover(mode: "user" | "search" | "mine") {
    if (!props.hasMdblist) {
      setDiscoverError("Add an MDBList API key on the API keys tab first.");
      return;
    }
    setDiscovering(true);
    setDiscoverError(null);
    try {
      const body: Record<string, string> = {};
      if (props.mdblistApiKey) body.mdblistApiKey = props.mdblistApiKey;
      if (mode === "user") body.username = username.trim();
      else if (mode === "search") body.search = search.trim();
      const res = await fetch("/api/catalogs/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as {
        mdblistLists?: MdblistListSummary[];
        error?: string;
      };
      if (!res.ok) {
        setDiscoverError(data.error ?? "Could not load MDBList lists.");
        setRemoteLists([]);
        return;
      }
      setRemoteLists(data.mdblistLists ?? []);
      if ((data.mdblistLists ?? []).length === 0) {
        setDiscoverError("No lists found.");
      }
    } catch {
      setDiscoverError("Network error loading lists.");
      setRemoteLists([]);
    } finally {
      setDiscovering(false);
    }
  }

  const listChecked = (list: MdblistListSummary) => {
    const defs = mdblistListToCatalogDefinitions(list);
    return defs.every((d) => selectedKeys.has(catalogDefinitionKey(d)));
  };

  if (!props.hasTmdb && !props.hasMdblist) {
    return (
      <SetupPanel
        title="Catalogs"
        hint="Add a TMDB or MDBList key on the API keys tab to browse catalogs."
      >
        <p className="text-sm text-zinc-500">
          Catalogs need TMDB (trending and popular) and/or MDBList (watchlist and custom lists).
        </p>
      </SetupPanel>
    );
  }

  return (
    <div className="polis-catalogs-panel space-y-6">
      {props.defaultCount > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/5 bg-white/[0.02] px-4 py-3">
          <p className="text-sm text-zinc-400">
            Defaults:{" "}
            {props.hasTmdb && props.hasMdblist
              ? "TMDB trending/popular plus MDBList watchlist"
              : props.hasTmdb
                ? "TMDB trending and popular"
                : "MDBList watchlist"}
          </p>
          <button className="polis-btn text-xs" onClick={props.onApplyDefaults} type="button">
            Use defaults
          </button>
        </div>
      ) : null}

      {props.hasTmdb ? (
        <SetupPanel title="TMDB" hint="Trending and popular rows for movies and TV.">
          <div className="space-y-2">
            {TMDB_CATALOG_PRESETS.map((def) => (
              <CatalogToggleRow
                key={catalogDefinitionKey(def)}
                checked={selectedKeys.has(catalogDefinitionKey(def))}
                label={def.name}
                onChange={(on) => togglePreset(def, on)}
              />
            ))}
          </div>
        </SetupPanel>
      ) : null}

      {props.hasMdblist ? (
        <>
          <SetupPanel title="MDBList watchlist" hint="Your account watchlist (movie and TV).">
            <div className="space-y-2">
              {MDBLIST_WATCHLIST_PRESETS.map((def) => (
                <CatalogToggleRow
                  key={catalogDefinitionKey(def)}
                  checked={selectedKeys.has(catalogDefinitionKey(def))}
                  label={def.name}
                  onChange={(on) => togglePreset(def, on)}
                />
              ))}
            </div>
          </SetupPanel>

          <SetupPanel
            className="polis-catalog-custom-lists"
            title="MDBList custom lists"
            hint="Load lists by username (e.g. snoak) or search by name."
          >
            <div className="mb-4 flex flex-wrap gap-2">
              <input
                className="polis-input min-w-[10rem] flex-1 text-sm"
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Username"
                value={username}
              />
              <button
                className="polis-btn text-xs"
                disabled={discovering}
                onClick={() => discover("user")}
                type="button"
              >
                {discovering ? "Loading…" : "Load user lists"}
              </button>
              <button
                className="polis-btn text-xs"
                disabled={discovering}
                onClick={() => discover("mine")}
                type="button"
              >
                My lists
              </button>
            </div>
            <div className="mb-4 flex flex-wrap gap-2">
              <input
                className="polis-input min-w-[10rem] flex-1 text-sm"
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search lists"
                value={search}
              />
              <button
                className="polis-btn text-xs"
                disabled={discovering || !search.trim()}
                onClick={() => discover("search")}
                type="button"
              >
                Search
              </button>
            </div>
            {discoverError ? (
              <p className="mb-3 text-sm text-amber-200/95">{discoverError}</p>
            ) : null}
            {remoteLists.length > 0 ? (
              <div className="polis-catalog-discover-list max-h-72 space-y-2 overflow-y-auto">
                {remoteLists.map((list) => {
                  const detailParts = [
                    list.username ? `@${list.username}` : null,
                    `#${list.id}`,
                  ].filter(Boolean);
                  return (
                    <CatalogToggleRow
                      key={list.id}
                      checked={listChecked(list)}
                      detail={detailParts.join(" · ")}
                      label={list.name}
                      onChange={(on) => toggleMdblistList(list, on)}
                    />
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-zinc-500">
                Load lists from a user profile or search, then enable the rows you want.
              </p>
            )}
          </SetupPanel>
        </>
      ) : null}

      <SetupPanel
        title="Selected"
        hint="Order here is the order shown in Stremio. Toggle off to remove. Save on the Install tab to apply."
      >
        {props.selected.length === 0 ? (
          <p className="text-sm text-zinc-500">No catalogs enabled yet.</p>
        ) : (
          <ul className="polis-catalog-selected-list space-y-2">
            {props.selected.map((c, index) => {
              const key = catalogDefinitionKey(c);
              return (
                <li
                  key={key}
                  className="polis-catalog-toggle-row flex flex-col gap-2 sm:flex-row sm:items-center"
                >
                  <div className="min-w-0 flex-1">
                    <SetupToggle
                      checked
                      label={`${c.name} (${c.type})`}
                      onChange={(on) => {
                        if (!on) {
                          props.onChange(removeCatalogSelection(props.selected, key));
                        }
                      }}
                    />
                  </div>
                  <span className="flex shrink-0 items-center justify-end gap-0.5 sm:pl-2">
                    <span className="mr-1 font-mono text-xs text-zinc-600">{index + 1}</span>
                    <button
                      aria-label={`Move ${c.name} up`}
                      className="rounded-md p-1 text-zinc-500 transition-colors hover:bg-white/5 hover:text-zinc-200 disabled:opacity-30"
                      disabled={index === 0}
                      onClick={() =>
                        props.onChange(moveCatalogSelection(props.selected, key, "up"))
                      }
                      type="button"
                    >
                      <ChevronUp aria-hidden className="h-4 w-4" />
                    </button>
                    <button
                      aria-label={`Move ${c.name} down`}
                      className="rounded-md p-1 text-zinc-500 transition-colors hover:bg-white/5 hover:text-zinc-200 disabled:opacity-30"
                      disabled={index === props.selected.length - 1}
                      onClick={() =>
                        props.onChange(moveCatalogSelection(props.selected, key, "down"))
                      }
                      type="button"
                    >
                      <ChevronDown aria-hidden className="h-4 w-4" />
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </SetupPanel>
    </div>
  );
}
