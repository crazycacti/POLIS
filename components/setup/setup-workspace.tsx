"use client";

import { useEffect, useMemo, useState } from "react";

import { CopyButton } from "@/components/copy-button";
import { SetupApiKeysPanel } from "@/components/setup/setup-api-keys-panel";
import { SetupOverlayPanel } from "@/components/setup/setup-overlay-panel";
import { SetupPanel, PatternRow } from "@/components/setup/setup-ui";
import { SetupDemoPreviewRow } from "@/components/setup/setup-demo-preview-row";
import { SetupPreviewSidebar } from "@/components/setup/setup-preview-sidebar";
import { useDebouncedValue } from "@/components/setup/use-preloaded-poster-src";
import { SetupCatalogsPanel } from "@/components/setup/setup-catalogs-panel";
import { SetupTabs, type SetupTab } from "@/components/setup/setup-tabs";
import type { PolisCatalogDefinition } from "@/lib/polis-catalogs";
import { mergePosterQueryForConfigurePreview } from "@/lib/integrator-auth";
import { SetupPasswordDialog } from "@/components/setup/setup-password-dialog";
import { stremioUserInstallUrl } from "@/lib/polis-install-urls";
import { aiometadataArtPatterns } from "@/lib/polis-urls";
import { defaultCatalogsForCredentials } from "@/lib/catalog-defaults";
import { parsePolisCatalogDefinitionsFromJson } from "@/lib/polis-catalogs-json";
import {
  parsePosterOverlayQuery,
  serializePosterQuery,
  showcasePosterOverlay,
  type PosterArtworkFallback,
  type PosterArtworkMovieSource,
  type PosterArtworkSource,
  type PosterOverlayQuery,
} from "@/lib/poster-query";
import {
  pickDefaultArtworkMovieSource,
  pickDefaultArtworkSource,
  type ArtworkKeyAvailability,
} from "@/lib/artwork-defaults";
import {
  artworkOptionLabel,
  isArtworkKeySatisfied,
  mapLegacyArtworkMovieSource,
  mapLegacyArtworkSource,
  shouldAutoResetArtworkMovieSource,
  shouldAutoResetArtworkSource,
  POSTER_ARTWORK_FALLBACK_UI_OPTIONS,
  POSTER_ARTWORK_MOVIE_UI_OPTIONS,
  POSTER_ARTWORK_UI_OPTIONS,
} from "@/lib/artwork-source-ui";
import { hasMdblistCredential } from "@/lib/overlay-requirements";
import { hasRequiredSetupKeys, hasTmdbCredential } from "@/lib/setup-required-keys";
import { POLIS_RENDERER_REVISION } from "@/lib/polis-renderer";
import { inferTmdbCredentialParams } from "@/lib/tmdb-credential-infer";
import { isImdbId } from "@/lib/stremio-imdb-id";

const LS_SECRET = "polis_user_tmdb_secret";
const LS_MDBLIST = "polis_user_mdblist_key";
const LS_FANART = "polis_user_fanart_key";
const LS_TVDB = "polis_user_tvdb_key";
const LS_CONFIG_ID = "polis_config_id";
const LS_CATALOGS = "polis_user_catalogs";
const LS_CATALOGS_CUSTOMIZED = "polis_catalogs_customized";

const CONFIG_FETCH_INIT = { credentials: "include" as const };

function clearStoredConfigId(): void {
  try {
    localStorage.removeItem(LS_CONFIG_ID);
  } catch {}
}

export function SetupWorkspace(props: {
  initialOrigin: string;
  hasServerTmdb: boolean;
  hasServerMdblist: boolean;
  hasServerFanart: boolean;
  hasServerTvdb: boolean;
  initialOverlay: PosterOverlayQuery;
  fixedConfigId?: string;
  pageTitle?: string;
  pageHint?: string;
}) {
  const [tab, setTab] = useState<SetupTab>("style");
  const [overlay, setOverlay] = useState(props.initialOverlay);
  const [imdbPreview, setImdbPreview] = useState("tt12042730");
  const [secretInput, setSecretInput] = useState("");
  const [mdblistInput, setMdblistInput] = useState("");
  const [fanartInput, setFanartInput] = useState("");
  const [tvdbInput, setTvdbInput] = useState("");
  const [configId, setConfigId] = useState<string | null>(props.fixedConfigId?.trim() || null);
  const [configHasPassword, setConfigHasPassword] = useState(false);
  const [configHasIntegrator, setConfigHasIntegrator] = useState(false);
  const [configExists, setConfigExists] = useState(false);
  const [installUrl, setInstallUrl] = useState<string | null>(null);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [passwordDialogError, setPasswordDialogError] = useState<string | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [configSaving, setConfigSaving] = useState(false);
  const [selectedCatalogs, setSelectedCatalogs] = useState<PolisCatalogDefinition[]>([]);
  const [catalogsCustomized, setCatalogsCustomized] = useState(false);
  const [catalogsHydrated, setCatalogsHydrated] = useState(false);
  const [setupHydrated, setSetupHydrated] = useState(false);
  const origin = props.initialOrigin.trim();

  function markCatalogsCustomized() {
    setCatalogsCustomized(true);
    try {
      localStorage.setItem(LS_CATALOGS_CUSTOMIZED, "1");
    } catch {}
  }

  function setCatalogSelection(next: PolisCatalogDefinition[], customized = true) {
    if (customized) markCatalogsCustomized();
    setSelectedCatalogs(next);
  }

  useEffect(() => {
    try {
      const s = localStorage.getItem(LS_SECRET) ?? "";
      const m = localStorage.getItem(LS_MDBLIST) ?? "";
      const f = localStorage.getItem(LS_FANART) ?? "";
      const t = localStorage.getItem(LS_TVDB) ?? "";
      const cid = props.fixedConfigId?.trim() || localStorage.getItem(LS_CONFIG_ID);
      setSecretInput(s);
      setMdblistInput(m);
      setFanartInput(f);
      setTvdbInput(t);
      if (cid?.trim()) setConfigId(cid.trim());
      if (localStorage.getItem(LS_CATALOGS_CUSTOMIZED) === "1") {
        setCatalogsCustomized(true);
      }
      const storedCatalogs = localStorage.getItem(LS_CATALOGS);
      if (storedCatalogs) {
        setSelectedCatalogs(parsePolisCatalogDefinitionsFromJson(storedCatalogs));
      }
    } catch {} finally {
      setCatalogsHydrated(true);
    }
  }, [props.fixedConfigId]);

  useEffect(() => {
    const cid = configId?.trim();
    if (!cid) {
      setConfigExists(false);
      setConfigHasIntegrator(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/config/${encodeURIComponent(cid)}`, CONFIG_FETCH_INIT);
        if (cancelled) return;
        if (!res.ok) {
          if (res.status === 404) {
            setConfigId(props.fixedConfigId?.trim() || null);
            if (!props.fixedConfigId?.trim()) clearStoredConfigId();
          }
          setConfigExists(false);
          setConfigHasIntegrator(false);
          return;
        }
        setConfigExists(true);
        const data = (await res.json()) as {
          catalogs?: PolisCatalogDefinition[];
          posterQuery?: string;
          hasPassword?: boolean;
          hasTmdbIntegrator?: boolean;
          hasMdblistIntegrator?: boolean;
        };
        if (cancelled) return;
        setConfigHasPassword(Boolean(data.hasPassword));
        setConfigHasIntegrator(
          Boolean(data.hasTmdbIntegrator || data.hasMdblistIntegrator),
        );
        if (typeof data.posterQuery === "string" && data.posterQuery.trim()) {
          setOverlay(parsePosterOverlayQuery(new URLSearchParams(data.posterQuery)));
        }
        if (Array.isArray(data.catalogs) && data.catalogs.length > 0) {
          setSelectedCatalogs(data.catalogs);
          markCatalogsCustomized();
        }
        if (origin) {
          setInstallUrl(stremioUserInstallUrl(origin, cid));
        }
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, [configId, origin]);

  useEffect(() => {
    try {
      localStorage.setItem(LS_CATALOGS, JSON.stringify(selectedCatalogs));
    } catch {}
  }, [selectedCatalogs]);

  const queryString = useMemo(() => serializePosterQuery(overlay), [overlay]);
  const showcaseQueryString = useMemo(
    () => serializePosterQuery(showcasePosterOverlay()),
    [],
  );
  const debouncedOverlay = useDebouncedValue(overlay, 400);
  const previewOverlayQuery = useMemo(
    () => serializePosterQuery(debouncedOverlay),
    [debouncedOverlay],
  );

  useEffect(() => {
    if (!configId) {
      setInstallUrl(null);
    }
  }, [queryString, selectedCatalogs, configId]);

  const needsPasswordOnSave = !configId || !configHasPassword;
  const secretCheck = useMemo(() => inferTmdbCredentialParams(secretInput), [secretInput]);
  const userAuthParams = secretCheck.params;
  const browserArtworkKeys = useMemo(
    () => ({
      mdblistApiKey: mdblistInput.trim() || null,
      fanartApiKey: fanartInput.trim() || null,
      tvdbApiKey: tvdbInput.trim() || null,
    }),
    [fanartInput, mdblistInput, tvdbInput],
  );
  const previewQueryString = useMemo(
    () =>
      mergePosterQueryForConfigurePreview(
        previewOverlayQuery,
        {
          hasServerTmdb: props.hasServerTmdb,
          hasServerMdblist: props.hasServerMdblist,
          hasServerFanart: props.hasServerFanart,
          hasServerTvdb: props.hasServerTvdb,
        },
        userAuthParams,
        browserArtworkKeys,
      ),
    [
      browserArtworkKeys,
      previewOverlayQuery,
      props.hasServerFanart,
      props.hasServerMdblist,
      props.hasServerTmdb,
      props.hasServerTvdb,
      userAuthParams,
    ],
  );

  const idOk = isImdbId(imdbPreview);
  const hasPreviewCredential = props.hasServerTmdb || Boolean(userAuthParams);
  const hasCatalogTmdb = props.hasServerTmdb || Boolean(userAuthParams);
  const hasMdblist = hasMdblistCredential(
    props.hasServerMdblist,
    browserArtworkKeys.mdblistApiKey,
  );
  const hasCatalogMdblist = hasMdblist;
  const hasRequiredKeys = useMemo(
    () =>
      hasRequiredSetupKeys({
        hasServerTmdb: props.hasServerTmdb,
        tmdbInput: secretInput,
        hasServerMdblist: props.hasServerMdblist,
        mdblistInput: mdblistInput,
      }),
    [mdblistInput, props.hasServerMdblist, props.hasServerTmdb, secretInput],
  );
  const hasTmdb = hasTmdbCredential(props.hasServerTmdb, secretInput);

  const installLockTooltip = useMemo(() => {
    if (hasRequiredKeys) return undefined;
    const missing: string[] = [];
    if (!hasTmdb) missing.push("TMDB");
    if (!hasMdblist) missing.push("MDBList");
    if (missing.length === 0) {
      return "Add your API keys on the API keys tab to unlock Install.";
    }
    if (missing.length === 2) {
      return "TMDB and MDBList are required for poster overlays. Add both keys on the API keys tab to unlock Install.";
    }
    if (missing[0] === "TMDB") {
      return "TMDB and MDBList are required for poster overlays. Add your TMDB key on the API keys tab to unlock Install.";
    }
    return "TMDB and MDBList are required for poster overlays. Add your MDBList key on the API keys tab to unlock Install.";
  }, [hasMdblist, hasRequiredKeys, hasTmdb]);

  const overlayKeysMessage = useMemo(() => {
    if (hasRequiredKeys) return null;
    return "TMDB and MDBList are both required for poster overlays. TMDB provides the poster and title details; MDBList provides ratings, trend labels, quality badges, and age labels. Add both keys on the API keys tab.";
  }, [hasRequiredKeys]);

  useEffect(() => {
    if (!catalogsHydrated) return;

    if (!setupHydrated) {
      setSetupHydrated(true);
      if (!hasRequiredKeys) {
        setTab("keys");
        return;
      }
    }

    if (tab === "export" && !hasRequiredKeys) {
      setTab("keys");
    }
  }, [catalogsHydrated, setupHydrated, hasRequiredKeys, tab]);

  const artworkKeys: ArtworkKeyAvailability = useMemo(
    () => ({
      hasTmdb: props.hasServerTmdb || Boolean(userAuthParams),
      hasFanart: props.hasServerFanart || Boolean(fanartInput.trim()),
      hasTvdb: props.hasServerTvdb || Boolean(tvdbInput.trim()),
    }),
    [fanartInput, props.hasServerFanart, props.hasServerTmdb, props.hasServerTvdb, tvdbInput, userAuthParams],
  );

  const defaultCatalogSelection = useMemo(
    () => defaultCatalogsForCredentials(hasCatalogTmdb, hasCatalogMdblist),
    [hasCatalogTmdb, hasCatalogMdblist],
  );

  useEffect(() => {
    if (!catalogsHydrated || catalogsCustomized) return;
    if (selectedCatalogs.length > 0) return;
    if (defaultCatalogSelection.length === 0) return;
    setSelectedCatalogs(defaultCatalogSelection);
  }, [
    catalogsHydrated,
    catalogsCustomized,
    selectedCatalogs.length,
    defaultCatalogSelection,
  ]);

  function applyDefaultCatalogs() {
    setSelectedCatalogs(defaultCatalogSelection);
    markCatalogsCustomized();
  }

  useEffect(() => {
    const artwork = mapLegacyArtworkSource(overlay.artwork);
    const artworkMovie = mapLegacyArtworkMovieSource(overlay.artworkMovie);
    const fbOpt = POSTER_ARTWORK_FALLBACK_UI_OPTIONS.find((o) => o.value === overlay.artworkFallback);

    let nextArtwork = artwork;
    if (shouldAutoResetArtworkSource(artwork, artworkKeys)) {
      nextArtwork = pickDefaultArtworkSource(artworkKeys);
    }

    let nextMovie = artworkMovie;
    if (shouldAutoResetArtworkMovieSource(artworkMovie, artworkKeys)) {
      nextMovie = pickDefaultArtworkMovieSource(artworkKeys);
    }

    let nextFb = overlay.artworkFallback;
    if (!fbOpt || !isArtworkKeySatisfied(fbOpt.key, artworkKeys)) {
      nextFb = "metahub";
    }

    if (
      nextArtwork !== overlay.artwork ||
      nextMovie !== overlay.artworkMovie ||
      nextFb !== overlay.artworkFallback
    ) {
      setOverlay((o) => ({
        ...o,
        artwork: nextArtwork,
        artworkMovie: nextMovie,
        artworkFallback: nextFb,
      }));
    }
  }, [artworkKeys, overlay.artwork, overlay.artworkMovie, overlay.artworkFallback]);

  const useConfigScopedPreview = Boolean(
    configId &&
      configExists &&
      configHasIntegrator &&
      !props.hasServerTmdb,
  );

  const livePreviewSrc = useMemo(() => {
    if (!hasPreviewCredential || !idOk) return null;
    const rev = `polis_r=${POLIS_RENDERER_REVISION}`;
    const path =
      configId && useConfigScopedPreview
        ? `/${configId}/poster/imdb/poster-default/${imdbPreview}.jpg`
        : `/poster/imdb/poster-default/${imdbPreview}.jpg`;
    const qs = previewQueryString ? `${previewQueryString}&${rev}` : rev;
    return `${path}?${qs}`;
  }, [
    configExists,
    configId,
    configHasIntegrator,
    hasPreviewCredential,
    idOk,
    imdbPreview,
    previewQueryString,
    props.hasServerTmdb,
    useConfigScopedPreview,
  ]);
  const patterns = origin
    ? aiometadataArtPatterns(origin, queryString, userAuthParams, browserArtworkKeys, {
        hasServerTmdb: props.hasServerTmdb,
        hasServerMdblist: props.hasServerMdblist,
        hasServerFanart: props.hasServerFanart,
        hasServerTvdb: props.hasServerTvdb,
      })
    : null;
  function handleSaveClick() {
    if (!origin) {
      setConfigError("Set POLIS_PUBLIC_URL on the server first.");
      return;
    }
    if (needsPasswordOnSave) {
      setPasswordDialogError(null);
      setPasswordDialogOpen(true);
      return;
    }
    void saveConfigToServer();
  }

  async function saveConfigToServer(
    password?: string,
    passwordConfirm?: string,
    forceCreate = false,
  ) {
    if (!origin) {
      setConfigError("Set POLIS_PUBLIC_URL on the server first.");
      return;
    }
    setConfigSaving(true);
    setConfigError(null);
    setPasswordDialogError(null);
    try {
      const catalogsToSave =
        selectedCatalogs.length > 0 ? selectedCatalogs : defaultCatalogSelection;
      const integrator: { tmdbSecret?: string | null; mdblistApiKey?: string | null } = {};
      if (secretInput.trim()) integrator.tmdbSecret = secretInput.trim();
      if (mdblistInput.trim()) integrator.mdblistApiKey = mdblistInput.trim();

      const existingConfigId =
        !forceCreate && configExists && configId?.trim() ? configId.trim() : undefined;

      const body: Record<string, unknown> = {
        posterQuery: queryString,
        catalogs: catalogsToSave,
        ...(Object.keys(integrator).length > 0 ? { integrator } : {}),
      };
      if (existingConfigId) body.configId = existingConfigId;
      if (needsPasswordOnSave || forceCreate) {
        body.password = password;
        body.passwordConfirm = passwordConfirm;
      }

      const res = await fetch("/api/config", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as {
        configId?: string;
        error?: string;
        hasPassword?: boolean;
      };
      if (
        res.status === 404 &&
        existingConfigId &&
        data.error === "Config not found"
      ) {
        setConfigId(null);
        setConfigExists(false);
        clearStoredConfigId();
        return saveConfigToServer(password, passwordConfirm, true);
      }
      if (!res.ok || !data.configId) {
        const message = data.error ?? "Could not save config.";
        if (password !== undefined) {
          setPasswordDialogError(message);
        } else {
          setConfigError(message);
        }
        return;
      }
      setPasswordDialogOpen(false);
      setConfigId(data.configId);
      setConfigExists(true);
      setConfigHasPassword(Boolean(data.hasPassword ?? true));
      localStorage.setItem(LS_CONFIG_ID, data.configId);
      if (integrator.tmdbSecret || integrator.mdblistApiKey) {
        setConfigHasIntegrator(true);
      }
      setInstallUrl(stremioUserInstallUrl(origin, data.configId));
    } catch {
      const message = "Network error saving config.";
      if (password !== undefined) {
        setPasswordDialogError(message);
      } else {
        setConfigError(message);
      }
    } finally {
      setConfigSaving(false);
    }
  }

  function saveTmdbToBrowser() {
    try {
      if (secretInput.trim()) localStorage.setItem(LS_SECRET, secretInput.trim());
      else localStorage.removeItem(LS_SECRET);
    } catch {}
  }

  function clearTmdbBrowser() {
    setSecretInput("");
    try {
      localStorage.removeItem(LS_SECRET);
    } catch {}
  }

  function saveMdblistToBrowser() {
    try {
      if (mdblistInput.trim()) localStorage.setItem(LS_MDBLIST, mdblistInput.trim());
      else localStorage.removeItem(LS_MDBLIST);
    } catch {}
  }

  function clearMdblistBrowser() {
    setMdblistInput("");
    try {
      localStorage.removeItem(LS_MDBLIST);
    } catch {}
  }

  function saveFanartToBrowser() {
    try {
      if (fanartInput.trim()) localStorage.setItem(LS_FANART, fanartInput.trim());
      else localStorage.removeItem(LS_FANART);
    } catch {}
  }

  function clearFanartBrowser() {
    setFanartInput("");
    try {
      localStorage.removeItem(LS_FANART);
    } catch {}
  }

  function saveTvdbToBrowser() {
    try {
      if (tvdbInput.trim()) localStorage.setItem(LS_TVDB, tvdbInput.trim());
      else localStorage.removeItem(LS_TVDB);
    } catch {}
  }

  function clearTvdbBrowser() {
    setTvdbInput("");
    try {
      localStorage.removeItem(LS_TVDB);
    } catch {}
  }

  return (
    <div className="polis-configure-page mx-auto max-w-4xl px-4 pb-16 pt-8 sm:px-6">
      <SetupPasswordDialog
        error={passwordDialogError}
        isNewProfile={!configId}
        onClose={() => {
          if (!configSaving) setPasswordDialogOpen(false);
        }}
        onConfirm={(password, passwordConfirm) => {
          void saveConfigToServer(password, passwordConfirm);
        }}
        open={passwordDialogOpen}
        saving={configSaving}
      />
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-white">
          {props.pageTitle ?? "Setup"}
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          {props.pageHint ?? "Tune posters, then copy install links."}
        </p>
      </header>

      {!origin ? (
        <p className="mb-6 rounded-lg border border-amber-900/40 bg-amber-950/25 px-4 py-3 text-sm text-amber-100/90">
          Set <code className="font-mono text-xs">POLIS_PUBLIC_URL</code> for public install links.
        </p>
      ) : null}

      <SetupTabs
        active={tab}
        installLocked={!hasRequiredKeys}
        installLockTooltip={installLockTooltip}
        onChange={setTab}
      />

      {tab === "style" && overlayKeysMessage ? (
        <p className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100/95">
          {overlayKeysMessage}
        </p>
      ) : null}

      {tab === "style" ? (
        <>
          <SetupDemoPreviewRow
            overlayQueryString={previewOverlayQuery}
            showcaseQueryString={showcaseQueryString}
          />
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
          <div className="min-w-0 flex-1">
          <SetupPanel title="Poster art">
            <label className="block">
              <span className="mb-1.5 block text-xs text-zinc-500">
                Poster art source
                {overlay.artwork === "tvdb" ? " (TV series)" : ""}
              </span>
              <select
                className="polis-select max-w-md"
                onChange={(e) => {
                  const artwork = e.target.value as PosterArtworkSource;
                  setOverlay((o) => ({
                    ...o,
                    artwork,
                    ...(artwork === "tvdb" ? { artworkMovie: o.artworkMovie ?? "tmdb" } : {}),
                  }));
                }}
                value={overlay.artwork}
              >
                {POSTER_ARTWORK_UI_OPTIONS.map((opt) => {
                  const available = isArtworkKeySatisfied(opt.key, artworkKeys);
                  return (
                    <option disabled={!available} key={opt.value} value={opt.value}>
                      {artworkOptionLabel(opt, available)}
                    </option>
                  );
                })}
              </select>
            </label>
            {overlay.artwork === "tvdb" ? (
              <label className="mt-3 block">
                <span className="mb-1.5 block text-xs text-zinc-500">Movie poster source</span>
                <select
                  className="polis-select max-w-md"
                  onChange={(e) =>
                    setOverlay((o) => ({
                      ...o,
                      artworkMovie: e.target.value as PosterArtworkMovieSource,
                    }))
                  }
                  value={overlay.artworkMovie}
                >
                  {POSTER_ARTWORK_MOVIE_UI_OPTIONS.map((opt) => {
                    const available = isArtworkKeySatisfied(opt.key, artworkKeys);
                    return (
                      <option disabled={!available} key={opt.value} value={opt.value}>
                        {artworkOptionLabel(opt, available)}
                      </option>
                    );
                  })}
                </select>
              </label>
            ) : null}
            <label className="mt-3 block">
              <span className="mb-1.5 block text-xs text-zinc-500">Poster fallback</span>
              <select
                className="polis-select max-w-md"
                onChange={(e) =>
                  setOverlay((o) => ({
                    ...o,
                    artworkFallback: e.target.value as PosterArtworkFallback,
                  }))
                }
                value={overlay.artworkFallback}
              >
                {POSTER_ARTWORK_FALLBACK_UI_OPTIONS.map((opt) => {
                  const available = isArtworkKeySatisfied(opt.key, artworkKeys);
                  return (
                    <option disabled={!available} key={opt.value} value={opt.value}>
                      {artworkOptionLabel(opt, available)}
                    </option>
                  );
                })}
              </select>
            </label>
          </SetupPanel>
          <SetupOverlayPanel overlay={overlay} setOverlay={setOverlay} />
          </div>
          <SetupPreviewSidebar
            hasPreviewCredential={hasPreviewCredential}
            idOk={idOk}
            imdbPreview={imdbPreview}
            liveError={
              !props.hasServerTmdb && secretInput.trim() ? secretCheck.error : null
            }
            livePreviewSrc={livePreviewSrc}
            onImdbChange={setImdbPreview}
          />
        </div>
        </>
      ) : null}

      {tab === "keys" ? (
        <SetupPanel title="API keys">
          <SetupApiKeysPanel
            fanartValue={fanartInput}
            hasServerFanart={props.hasServerFanart}
            hasServerMdblist={props.hasServerMdblist}
            hasServerTmdb={props.hasServerTmdb}
            hasServerTvdb={props.hasServerTvdb}
            mdblistValue={mdblistInput}
            onFanartChange={setFanartInput}
            onFanartClear={clearFanartBrowser}
            onFanartSave={saveFanartToBrowser}
            onMdblistChange={setMdblistInput}
            onMdblistClear={clearMdblistBrowser}
            onMdblistSave={saveMdblistToBrowser}
            onTmdbChange={setSecretInput}
            onTmdbClear={clearTmdbBrowser}
            onTmdbSave={saveTmdbToBrowser}
            onTvdbChange={setTvdbInput}
            onTvdbClear={clearTvdbBrowser}
            onTvdbSave={saveTvdbToBrowser}
            tmdbValue={secretInput}
            tvdbValue={tvdbInput}
          />
        </SetupPanel>
      ) : null}

      {tab === "catalogs" ? (
        <SetupCatalogsPanel
          defaultCount={defaultCatalogSelection.length}
          hasMdblist={hasCatalogMdblist}
          hasTmdb={hasCatalogTmdb}
          mdblistApiKey={browserArtworkKeys.mdblistApiKey}
          onApplyDefaults={applyDefaultCatalogs}
          onChange={setCatalogSelection}
          selected={selectedCatalogs}
        />
      ) : null}

      {tab === "export" ? (
        <>
          {overlayKeysMessage ? (
            <p className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100/95">
              {overlayKeysMessage}
            </p>
          ) : null}

          <SetupPanel
            title="Addon install"
            hint="Save to update this profile, then install the URL in Stremio."
          >
            <button
              className="polis-btn mb-4 text-xs"
              disabled={configSaving || !hasRequiredKeys}
              onClick={handleSaveClick}
              type="button"
            >
              {configSaving ? "Saving…" : configId ? "Save changes" : "Save and create profile"}
            </button>
            {configError ? <p className="mb-3 text-sm text-amber-200/95">{configError}</p> : null}
            {installUrl ? (
              <CopyRow label="Install URL (Stremio)" value={installUrl} />
            ) : (
              <p className="text-sm text-zinc-500">
                Your install URL appears here after you save. Change overlays? Save again to refresh
                the link.
              </p>
            )}
          </SetupPanel>

          <SetupPanel
            title="AIOMetadata patterns"
            hint="Paste into customPosterUrlPattern, customBackgroundUrlPattern, and customLogoUrlPattern in AIOMetadata."
          >
            {patterns ? (
              <div className="space-y-4">
                <PatternRow label="Poster" value={patterns.posterPattern} />
                <PatternRow label="Background" value={patterns.backgroundPattern} />
                <PatternRow label="Logo" value={patterns.logoPattern} />
              </div>
            ) : (
              <p className="text-sm text-zinc-600">Set POLIS_PUBLIC_URL first.</p>
            )}
          </SetupPanel>

        </>
      ) : null}
    </div>
  );
}

function CopyRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="mb-1 text-xs text-zinc-500">{label}</p>
      <div className="polis-code flex flex-wrap items-center justify-between gap-3">
        <code className="break-all text-xs text-zinc-300">{value ?? "Set POLIS_PUBLIC_URL"}</code>
        {value ? <CopyButton text={value} /> : null}
      </div>
    </div>
  );
}
