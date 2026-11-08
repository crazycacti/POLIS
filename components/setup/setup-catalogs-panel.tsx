"use client";

import { ChevronDown, ChevronUp, MoreHorizontal, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";

import { PolisSwitch } from "@/components/setup/polis-switch";
import { SetupMenu } from "@/components/setup/setup-menu";
import {
  MDBLIST_WATCHLIST_PRESETS,
  TMDB_CATALOG_PRESETS,
  TMDB_EXTRA_CATALOG_PRESETS,
} from "@/lib/catalog-presets";
import { CATALOG_NAME_MAX_LENGTH, type PolisCatalogDefinition } from "@/lib/polis-catalogs";
import {
  catalogDefinitionKey,
  mergeCatalogSelections,
  moveCatalogSelection,
  moveCatalogSelectionToEdge,
  removeCatalogSelection,
  updateCatalogSelection,
} from "@/lib/polis-catalogs-json";
import {
  mdblistListToCatalogDefinitions,
  popularMdblistAuthors,
  type MdblistListSummary,
} from "@/lib/mdblist-list-catalog";

const CATALOG_LIMIT = 32;
const TMDB_CATALOG_OPTIONS = [...TMDB_CATALOG_PRESETS, ...TMDB_EXTRA_CATALOG_PRESETS];

type CatalogSource = "tmdb" | "watchlist" | "lists";
type DiscoverMode = "user" | "search" | "mine" | "top";

const POPULAR_AUTHOR_LIMIT = 8;
type PendingFocus =
  | { action: "up" | "down" | "rename" | "edge"; key: string }
  | { action: "remove"; index: number };

const SOURCE_LABELS: Record<CatalogSource, string> = {
  tmdb: "TMDB",
  watchlist: "Watchlist",
  lists: "MDBList lists",
};

function typeLabel(type: PolisCatalogDefinition["type"]): string {
  return type === "movie" ? "movies" : "series";
}

function providerLabel(def: PolisCatalogDefinition): string {
  if (def.provider.kind === "tmdb") return "TMDB";
  return def.provider.list === "watchlist" ? "MDBList watchlist" : "MDBList list";
}

function CatalogCheckRow(props: {
  label: string;
  detail?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label
      className={`flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 transition-colors ${
        props.disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:bg-white/5"
      }`}
    >
      <input
        checked={props.checked}
        className="polis-focus h-4.5 w-4.5 shrink-0 cursor-[inherit] rounded accent-cyan-400"
        disabled={props.disabled}
        onChange={(e) => props.onChange(e.target.checked)}
        type="checkbox"
      />
      <span className="min-w-0">
        <span className="block truncate text-sm text-zinc-200">{props.label}</span>
        {props.detail ? (
          <span className="block truncate text-xs text-zinc-400">{props.detail}</span>
        ) : null}
      </span>
    </label>
  );
}

export function SetupCatalogsPanel(props: {
  selected: PolisCatalogDefinition[];
  onChange: (next: PolisCatalogDefinition[]) => void;
  onApplyDefaults: () => void;
  onGoToKeys: () => void;
  defaultCount: number;
  hasTmdb: boolean;
  hasMdblist: boolean;
  mdblistApiKey: string | null;
}) {
  const sources = useMemo(() => {
    const out: CatalogSource[] = [];
    if (props.hasTmdb) out.push("tmdb");
    out.push("watchlist", "lists");
    return out;
  }, [props.hasTmdb]);
  const [sourceChoice, setSourceChoice] = useState<CatalogSource | null>(null);
  const source = sourceChoice && sources.includes(sourceChoice) ? sourceChoice : sources[0];
  const [username, setUsername] = useState("");
  const [search, setSearch] = useState("");
  const [remoteLists, setRemoteLists] = useState<MdblistListSummary[]>([]);
  const [discoverError, setDiscoverError] = useState<string | null>(null);
  const [noListsFound, setNoListsFound] = useState(false);
  const [discovering, setDiscovering] = useState<DiscoverMode | null>(null);
  const [topLists, setTopLists] = useState<MdblistListSummary[] | null>(null);
  const popularAuthors = useMemo(
    () => (topLists ? popularMdblistAuthors(topLists, POPULAR_AUTHOR_LIMIT) : []),
    [topLists],
  );
  const selectedPaneRef = useRef<HTMLElement>(null);
  const [renamingKey, setRenamingKey] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const selectedHeadingRef = useRef<HTMLHeadingElement>(null);
  const pendingFocus = useRef<PendingFocus | null>(null);

  const selectedKeys = useMemo(
    () => new Set(props.selected.map(catalogDefinitionKey)),
    [props.selected],
  );
  const duplicateNames = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of props.selected) counts.set(c.name, (counts.get(c.name) ?? 0) + 1);
    return new Set([...counts].filter(([, n]) => n > 1).map(([name]) => name));
  }, [props.selected]);
  const atLimit = props.selected.length >= CATALOG_LIMIT;

  const displayName = (c: PolisCatalogDefinition) =>
    duplicateNames.has(c.name) ? `${c.name} (${typeLabel(c.type)})` : c.name;

  useEffect(() => {
    const pending = pendingFocus.current;
    const pane = selectedPaneRef.current;
    if (!pending || !pane) return;
    pendingFocus.current = null;
    if (pending.action === "remove") {
      const visible = [...pane.querySelectorAll<HTMLButtonElement>("[data-catalog-remove]")].filter(
        (button) => button.offsetParent !== null,
      );
      const names = pane.querySelectorAll<HTMLButtonElement>("[data-catalog-name]");
      const targets = visible.length > 0 ? visible : [...names];
      const next = targets[Math.min(pending.index, targets.length - 1)];
      (next ?? selectedHeadingRef.current)?.focus();
      return;
    }
    const row = pane.querySelector(`[data-catalog-key="${CSS.escape(pending.key)}"]`);
    if (pending.action === "rename" || pending.action === "edge") {
      row?.querySelector<HTMLButtonElement>("[data-catalog-name]")?.focus();
      return;
    }
    const sameDirection = row?.querySelector<HTMLButtonElement>(
      `[data-catalog-move="${pending.action}"]:not(:disabled)`,
    );
    const anyMove = row?.querySelector<HTMLButtonElement>("[data-catalog-move]:not(:disabled)");
    (sameDirection ?? anyMove)?.focus();
  }, [props.selected, renamingKey]);

  const wouldExceedLimit = (count: number) => props.selected.length + count > CATALOG_LIMIT;

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

  async function discover(mode: DiscoverMode, author?: string) {
    setDiscovering(mode);
    setDiscoverError(null);
    setNoListsFound(false);
    try {
      const body: Record<string, string | boolean> = {};
      if (props.mdblistApiKey) body.mdblistApiKey = props.mdblistApiKey;
      if (mode === "user") body.username = (author ?? username).trim();
      else if (mode === "search") body.search = search.trim();
      else if (mode === "top") body.top = true;
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
      const lists = data.mdblistLists ?? [];
      if (mode === "top") setTopLists(lists);
      setRemoteLists(lists);
      setNoListsFound(lists.length === 0);
    } catch {
      setDiscoverError("Network error loading lists.");
      setRemoteLists([]);
    } finally {
      setDiscovering(null);
    }
  }

  const topRequested = useRef(false);
  useEffect(() => {
    if (source !== "lists" || !props.hasMdblist || topRequested.current) return;
    topRequested.current = true;
    void discover("top");
  });

  function showAuthor(author: string) {
    setUsername(author);
    if (!discovering) void discover("user", author);
  }

  const renameOpen = useRef<string | null>(null);

  function startRename(def: PolisCatalogDefinition) {
    const key = catalogDefinitionKey(def);
    renameOpen.current = key;
    setRenamingKey(key);
    setRenameDraft(def.name);
  }

  function finishRename(save: boolean) {
    const key = renameOpen.current;
    renameOpen.current = null;
    setRenamingKey(null);
    if (!key) return;
    if (save && renameDraft.trim()) {
      props.onChange(updateCatalogSelection(props.selected, key, { name: renameDraft }));
    }
    pendingFocus.current = { action: "rename", key };
  }

  function submitSearch(e: FormEvent) {
    e.preventDefault();
    if (search.trim() && !discovering) void discover("search");
  }

  function submitUsername(e: FormEvent) {
    e.preventDefault();
    if (username.trim() && !discovering) void discover("user");
  }

  if (!props.hasTmdb && !props.hasMdblist) {
    return (
      <div className="flex flex-wrap items-center gap-3 py-6">
        <p className="text-sm text-zinc-400">Add a TMDB or MDBList key to browse catalogs.</p>
        <button className="polis-btn-secondary" onClick={props.onGoToKeys} type="button">
          Go to API keys
        </button>
      </div>
    );
  }

  const presetRows = (defs: PolisCatalogDefinition[], label: (def: PolisCatalogDefinition) => string) =>
    defs.map((def) => {
      const checked = selectedKeys.has(catalogDefinitionKey(def));
      return (
        <li key={catalogDefinitionKey(def)}>
          <CatalogCheckRow
            checked={checked}
            disabled={!checked && wouldExceedLimit(1)}
            label={label(def)}
            onChange={(on) => togglePreset(def, on)}
          />
        </li>
      );
    });

  return (
    <div className="polis-catalogs-panel grid gap-x-10 gap-y-8 lg:grid-cols-2 lg:items-start">
      <section aria-labelledby="catalogs-selected-heading" ref={selectedPaneRef}>
        <div className="mb-3 flex min-h-10 flex-wrap items-center justify-between gap-2">
          <h2
            className="text-lg font-semibold text-white outline-none"
            id="catalogs-selected-heading"
            ref={selectedHeadingRef}
            tabIndex={-1}
          >
            Your catalogs
            <span className="ml-2 text-sm font-normal tabular-nums text-zinc-400">
              {props.selected.length}
              <span className="sr-only"> {props.selected.length === 1 ? "row" : "rows"}</span>
            </span>
          </h2>
          {props.defaultCount > 0 && props.selected.length > 0 ? (
            <button className="polis-link-btn" onClick={props.onApplyDefaults} type="button">
              Use defaults
            </button>
          ) : null}
        </div>

        {props.selected.length === 0 ? (
          <div className="flex flex-wrap items-center gap-3 border-t border-white/5 pt-4">
            <p className="text-sm text-zinc-400">No catalogs yet.</p>
            {props.defaultCount > 0 ? (
              <button className="polis-btn-secondary" onClick={props.onApplyDefaults} type="button">
                Use defaults
              </button>
            ) : null}
          </div>
        ) : (
          <>
          <p aria-hidden className="flex justify-end pb-1 text-xs text-zinc-400">
            <span className="mr-[calc(2.25rem+0.25rem)] w-12 text-center pointer-coarse:mr-[calc(2.75rem+0.25rem)] sm:mr-[calc(9rem+0.25rem)] sm:pointer-coarse:mr-[calc(11rem+0.25rem)]">Home</span>
          </p>
          <ol className="polis-catalog-selected-list divide-y divide-white/5 border-y border-white/5">
            {props.selected.map((c, index) => {
              const key = catalogDefinitionKey(c);
              const name = displayName(c);
              return (
                <li className="flex items-center gap-2 py-2" data-catalog-key={key} key={key}>
                  <span className="w-6 shrink-0 text-right font-mono text-xs text-zinc-500" aria-hidden>
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1 pl-1">
                    {renamingKey === key ? (
                      <input
                        aria-label={`Rename ${name}`}
                        autoFocus
                        className="polis-input w-full py-1 text-sm"
                        maxLength={CATALOG_NAME_MAX_LENGTH}
                        onBlur={() => finishRename(true)}
                        onFocus={(e) => e.currentTarget.select()}
                        onChange={(e) => setRenameDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            finishRename(true);
                          } else if (e.key === "Escape") {
                            e.preventDefault();
                            finishRename(false);
                          }
                        }}
                        value={renameDraft}
                      />
                    ) : (
                      <button
                        aria-label={`Rename ${name}`}
                        className="polis-focus block max-w-full truncate rounded text-left text-sm text-zinc-200 hover:text-white"
                        data-catalog-name
                        onClick={() => startRename(c)}
                        type="button"
                      >
                        {name}
                      </button>
                    )}
                    {c.provider.kind === "mdblist" && !props.hasMdblist ? (
                      <span className="block truncate text-xs text-amber-200/95">
                        Needs your MDBList key
                      </span>
                    ) : (
                      <span className="block truncate text-xs text-zinc-400">
                        {`${providerLabel(c)}, ${typeLabel(c.type)}`}
                      </span>
                    )}
                  </span>
                  <span className="flex shrink-0 items-center">
                    <span className="mr-1 flex w-12 justify-center">
                      <PolisSwitch
                        aria-label={`Show ${name} on Home`}
                        checked={c.home !== false}
                        onChange={(home) => props.onChange(updateCatalogSelection(props.selected, key, { home }))}
                      />
                    </span>
                    <SetupMenu
                      icon={MoreHorizontal}
                      iconOnly
                      items={[
                        { label: "Rename", onSelect: () => startRename(c) },
                        {
                          label: "Move up",
                          disabled: index === 0,
                          onSelect: () => {
                            pendingFocus.current = { action: "edge", key };
                            props.onChange(moveCatalogSelection(props.selected, key, "up"));
                          },
                        },
                        {
                          label: "Move down",
                          disabled: index === props.selected.length - 1,
                          onSelect: () => {
                            pendingFocus.current = { action: "edge", key };
                            props.onChange(moveCatalogSelection(props.selected, key, "down"));
                          },
                        },
                        {
                          label: "Move to top",
                          disabled: index === 0,
                          onSelect: () => {
                            pendingFocus.current = { action: "edge", key };
                            props.onChange(moveCatalogSelectionToEdge(props.selected, key, "top"));
                          },
                        },
                        {
                          label: "Move to bottom",
                          disabled: index === props.selected.length - 1,
                          onSelect: () => {
                            pendingFocus.current = { action: "edge", key };
                            props.onChange(moveCatalogSelectionToEdge(props.selected, key, "bottom"));
                          },
                        },
                        {
                          label: "Remove",
                          dividerBefore: true,
                          onSelect: () => {
                            pendingFocus.current = { action: "remove", index };
                            props.onChange(removeCatalogSelection(props.selected, key));
                          },
                        },
                      ]}
                      label={`More for ${name}`}
                    />
                    <button
                      aria-label={`Move ${name} up`}
                      className="polis-icon-btn hidden pointer-coarse:h-11 pointer-coarse:w-11 sm:inline-flex"
                      data-catalog-move="up"
                      disabled={index === 0}
                      onClick={() => {
                        pendingFocus.current = { action: "up", key };
                        props.onChange(moveCatalogSelection(props.selected, key, "up"));
                      }}
                      type="button"
                    >
                      <ChevronUp aria-hidden className="h-4 w-4" />
                    </button>
                    <button
                      aria-label={`Move ${name} down`}
                      className="polis-icon-btn hidden pointer-coarse:h-11 pointer-coarse:w-11 sm:inline-flex"
                      data-catalog-move="down"
                      disabled={index === props.selected.length - 1}
                      onClick={() => {
                        pendingFocus.current = { action: "down", key };
                        props.onChange(moveCatalogSelection(props.selected, key, "down"));
                      }}
                      type="button"
                    >
                      <ChevronDown aria-hidden className="h-4 w-4" />
                    </button>
                    <button
                      aria-label={`Remove ${name}`}
                      className="polis-icon-btn hidden pointer-coarse:h-11 pointer-coarse:w-11 sm:inline-flex"
                      data-catalog-remove
                      onClick={() => {
                        pendingFocus.current = { action: "remove", index };
                        props.onChange(removeCatalogSelection(props.selected, key));
                      }}
                      type="button"
                    >
                      <X aria-hidden className="h-4 w-4" />
                    </button>
                  </span>
                </li>
              );
            })}
          </ol>
          </>
        )}
      </section>

      <section aria-labelledby="catalogs-add-heading">
        <div className="mb-3 flex min-h-10 items-center">
          <h2 className="text-lg font-semibold text-white" id="catalogs-add-heading">
            Add catalogs
          </h2>
        </div>

        <div aria-label="Source" className="mb-4 flex flex-wrap gap-2" role="group">
          {sources.map((id) => (
            <button
              aria-pressed={source === id}
              className={`polis-tab ${source === id ? "polis-tab-active" : ""}`}
              key={id}
              onClick={() => setSourceChoice(id)}
              type="button"
            >
              {SOURCE_LABELS[id]}
            </button>
          ))}
        </div>

        {atLimit ? (
          <p className="mb-3 text-sm text-amber-200/95">
            {`Limit of ${CATALOG_LIMIT} rows reached. Remove one to add more.`}
          </p>
        ) : null}

        {source === "tmdb" ? (
          <ul className="space-y-1">{presetRows(TMDB_CATALOG_OPTIONS, (def) => def.name)}</ul>
        ) : null}

        {source !== "tmdb" && !props.hasMdblist ? (
          <div className="flex flex-wrap items-center gap-3 py-2">
            <p className="text-sm text-zinc-400">Add your MDBList key to use lists.</p>
            <button className="polis-btn-secondary" onClick={props.onGoToKeys} type="button">
              Go to API keys
            </button>
          </div>
        ) : null}

        {source === "watchlist" && props.hasMdblist ? (
          <ul className="space-y-1">
            {presetRows(MDBLIST_WATCHLIST_PRESETS, (def) => `Watchlist (${typeLabel(def.type)})`)}
          </ul>
        ) : null}

        {source === "lists" && props.hasMdblist ? (
          <div className="polis-catalog-custom-lists space-y-3">
            <form className="flex gap-2" onSubmit={submitSearch} role="search">
              <label className="sr-only" htmlFor="catalogs-list-search">
                Search lists
              </label>
              <input
                className="polis-input min-w-0 flex-1"
                id="catalogs-list-search"
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search lists"
                type="search"
                value={search}
              />
              <button
                className="polis-btn-secondary shrink-0"
                disabled={Boolean(discovering) || !search.trim()}
                type="submit"
              >
                {discovering === "search" ? "Searching…" : "Search"}
              </button>
            </form>
            <div className="flex flex-wrap gap-2">
              <button
                className="polis-btn-secondary shrink-0"
                disabled={Boolean(discovering)}
                onClick={() => void discover("top")}
                type="button"
              >
                {discovering === "top" ? "Loading…" : "Popular"}
              </button>
              <button
                className="polis-btn-secondary shrink-0"
                disabled={Boolean(discovering)}
                onClick={() => void discover("mine")}
                type="button"
              >
                {discovering === "mine" ? "Loading…" : "My lists"}
              </button>
              <form className="flex min-w-0 flex-1 basis-56 gap-2" onSubmit={submitUsername}>
                <label className="sr-only" htmlFor="catalogs-list-username">
                  MDBList username
                </label>
                <input
                  autoCapitalize="none"
                  autoCorrect="off"
                  className="polis-input min-w-0 flex-1"
                  id="catalogs-list-username"
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Username"
                  spellCheck={false}
                  value={username}
                />
                <button
                  className="polis-btn-secondary shrink-0"
                  disabled={Boolean(discovering) || !username.trim()}
                  type="submit"
                >
                  {discovering === "user" ? "Loading…" : "Load lists"}
                </button>
              </form>
            </div>

            {popularAuthors.length > 0 ? (
              <div aria-label="Popular authors" className="flex flex-wrap gap-2" role="group">
                {popularAuthors.map((author) => (
                  <button
                    className="polis-focus min-h-9 rounded-full border border-white/15 px-3 text-sm text-zinc-300 hover:border-white/30 hover:text-white pointer-coarse:min-h-11"
                    disabled={Boolean(discovering)}
                    key={author.username}
                    onClick={() => showAuthor(author.username)}
                    type="button"
                  >
                    {`@${author.username}`}
                  </button>
                ))}
              </div>
            ) : null}

            {discoverError ? (
              <p className="text-sm text-amber-200/95" role="alert">
                {discoverError}
              </p>
            ) : null}
            <p aria-live="polite" className="text-sm text-zinc-400" role="status">
              {noListsFound ? "No lists found." : null}
            </p>

            {remoteLists.length > 0 ? (
              <ul className="polis-catalog-discover-list max-h-80 space-y-1 overflow-y-auto">
                {remoteLists.map((list) => {
                  const defs = mdblistListToCatalogDefinitions(list);
                  const checked = defs.every((d) => selectedKeys.has(catalogDefinitionKey(d)));
                  const missing = defs.filter((d) => !selectedKeys.has(catalogDefinitionKey(d)));
                  const detail = [
                    list.username ? `@${list.username}` : null,
                    list.items != null ? `${list.items} ${list.items === 1 ? "title" : "titles"}` : `#${list.id}`,
                  ]
                    .filter(Boolean)
                    .join(", ");
                  return (
                    <li key={list.id}>
                      <CatalogCheckRow
                        checked={checked}
                        detail={detail}
                        disabled={!checked && wouldExceedLimit(missing.length)}
                        label={list.name}
                        onChange={(on) => toggleMdblistList(list, on)}
                      />
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>
        ) : null}
      </section>
    </div>
  );
}
