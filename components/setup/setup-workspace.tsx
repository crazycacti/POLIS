"use client";

import { useCallback, useEffect, useMemo, useState, type SetStateAction } from "react";

import { SetupApiKeysPanel } from "@/components/setup/setup-api-keys-panel";
import { SetupOverlayPanel } from "@/components/setup/setup-overlay-panel";
import { SetupPanel } from "@/components/setup/setup-ui";
import { SetupLooks } from "@/components/setup/setup-looks";
import { SetupPreviewSidebar } from "@/components/setup/setup-preview-sidebar";
import { useDebouncedValue } from "@/components/setup/use-preloaded-poster-src";
import { SetupCatalogsPanel } from "@/components/setup/setup-catalogs-panel";
import { SetupTabs, type SetupTab } from "@/components/setup/setup-tabs";
import { SetupSaveBar, type SetupSaveStatus } from "@/components/setup/setup-save-bar";
import { SetupChecklist } from "@/components/setup/setup-checklist";
import type { PolisCatalogDefinition } from "@/lib/polis-catalogs";
import { mergePosterQueryForConfigurePreview } from "@/lib/integrator-auth";
import { SetupPasswordDialog } from "@/components/setup/setup-password-dialog";
import { stremioUserInstallUrl } from "@/lib/polis-install-urls";
import { aiometadataArtPatterns } from "@/lib/polis-urls";
import { LOOK_CODE_PARAM, lookCodeFromSearch } from "@/lib/poster-look-code";
import { STARTER_LOOKS, matchesStarterLook } from "@/lib/poster-looks";
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
  type ArtworkSourceKey,
  POSTER_ARTWORK_FALLBACK_UI_OPTIONS,
  POSTER_ARTWORK_MOVIE_UI_OPTIONS,
  POSTER_ARTWORK_UI_OPTIONS,
} from "@/lib/artwork-source-ui";
import { hasMdblistCredential } from "@/lib/overlay-requirements";
import { hasRequiredSetupKeys, hasTmdbCredential } from "@/lib/setup-required-keys";
import { POLIS_RENDERER_REVISION } from "@/lib/polis-renderer";
import { inferTmdbCredentialParams } from "@/lib/tmdb-credential-infer";
import {
  hasUnsavedSetupChanges,
  NO_KEY_CHANGES,
  setupKeyChanges,
  setupSnapshot,
  type SetupKeyInputs,
} from "@/lib/setup-dirty-state";
import { isImdbId } from "@/lib/stremio-imdb-id";

const LS_SECRET = "polis_user_tmdb_secret";
const LS_MDBLIST = "polis_user_mdblist_key";
const LS_FANART = "polis_user_fanart_key";
const LS_TVDB = "polis_user_tvdb_key";
const LS_CONFIG_ID = "polis_config_id";
const LS_CATALOGS = "polis_user_catalogs";
const LS_CATALOGS_CUSTOMIZED = "polis_catalogs_customized";

const CONFIG_FETCH_INIT = { credentials: "include" as const };

const ARTWORK_KEY_NOTICE: Partial<Record<NonNullable<ArtworkSourceKey>, string>> = {
  fanart: "Fanart.tv art needs a Fanart key in this browser. Add it under API keys or choose another source.",
  tvdb: "TheTVDB art needs a TVDB key in this browser. Add it under API keys or choose another source.",
};

type BaselineSource = { query: string; catalogs: PolisCatalogDefinition[] | null };

function artworkResetKey(
  options: readonly { value: string; key: ArtworkSourceKey }[],
  value: string,
): ArtworkSourceKey {
  return options.find((o) => o.value === value)?.key ?? null;
}

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
  const [overlaySettled, setOverlaySettled] = useState(false);
  const [lookCodeParam, setLookCodeParam] = useState<string | null>(null);
  const [secretInput, setSecretInput] = useState("");
  const [mdblistInput, setMdblistInput] = useState("");
  const [fanartInput, setFanartInput] = useState("");
  const [tvdbInput, setTvdbInput] = useState("");
  const [configId, setConfigId] = useState<string | null>(props.fixedConfigId?.trim() || null);
  const [configHasPassword, setConfigHasPassword] = useState(false);
  const [configHasTmdbKey, setConfigHasTmdbKey] = useState(false);
  const [configHasMdblistKey, setConfigHasMdblistKey] = useState(false);
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
  const [baselineSource, setBaselineSource] = useState<BaselineSource | null>(null);
  const [savedSnapshot, setSavedSnapshot] = useState<string | null>(null);
  const [sentKeyInputs, setSentKeyInputs] = useState<SetupKeyInputs>({ tmdb: "", mdblist: "" });
  const [lookTouched, setLookTouched] = useState(false);
  const [artworkResetFrom, setArtworkResetFrom] = useState<ArtworkSourceKey>(null);
  const origin = props.initialOrigin.trim();
  const initialQueryString = useMemo(
    () => serializePosterQuery(props.initialOverlay),
    [props.initialOverlay],
  );

  const changeOverlay = useCallback((next: SetStateAction<PosterOverlayQuery>) => {
    setLookTouched(true);
    setOverlay(next);
  }, []);

  const changeArtwork = useCallback(
    (next: SetStateAction<PosterOverlayQuery>) => {
      setArtworkResetFrom(null);
      changeOverlay(next);
    },
    [changeOverlay],
  );

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
      setSentKeyInputs({ tmdb: s.trim(), mdblist: m.trim() });
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
      setConfigHasTmdbKey(false);
      setConfigHasMdblistKey(false);
      if (catalogsHydrated) {
        setBaselineSource({ query: initialQueryString, catalogs: null });
        setOverlaySettled(true);
      }
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
          setConfigHasTmdbKey(false);
          setConfigHasMdblistKey(false);
          setBaselineSource({ query: initialQueryString, catalogs: null });
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
        setConfigHasTmdbKey(Boolean(data.hasTmdbIntegrator));
        setConfigHasMdblistKey(Boolean(data.hasMdblistIntegrator));
        let baselineQuery = initialQueryString;
        if (typeof data.posterQuery === "string" && data.posterQuery.trim()) {
          const serverOverlay = parsePosterOverlayQuery(new URLSearchParams(data.posterQuery));
          baselineQuery = serializePosterQuery(serverOverlay);
          setOverlay(serverOverlay);
        }
        const serverCatalogs =
          Array.isArray(data.catalogs) && data.catalogs.length > 0 ? data.catalogs : null;
        if (serverCatalogs) {
          setSelectedCatalogs(serverCatalogs);
          markCatalogsCustomized();
        }
        setBaselineSource({ query: baselineQuery, catalogs: serverCatalogs });
        if (origin) {
          setInstallUrl(stremioUserInstallUrl(origin, cid));
        }
      } catch {} finally {
        if (!cancelled) setOverlaySettled(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [catalogsHydrated, configId, initialQueryString, origin]);

  useEffect(() => {
    setLookCodeParam(lookCodeFromSearch(window.location.search));
  }, []);

  const consumeLookLink = useCallback(() => {
    setLookCodeParam(null);
    const url = new URL(window.location.href);
    url.searchParams.delete(LOOK_CODE_PARAM);
    window.history.replaceState(window.history.state, "", url);
  }, []);

  useEffect(() => {
    if (!catalogsHydrated) return;
    try {
      localStorage.setItem(LS_CATALOGS, JSON.stringify(selectedCatalogs));
    } catch {}
  }, [catalogsHydrated, selectedCatalogs]);

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
  const hasProfileTmdb = configExists && configHasTmdbKey;
  const hasProfileMdblist = configExists && configHasMdblistKey;
  const configHasIntegrator = configHasTmdbKey || configHasMdblistKey;
  const hasRequiredKeys = useMemo(
    () =>
      hasRequiredSetupKeys({
        hasServerTmdb: props.hasServerTmdb,
        hasProfileTmdb,
        tmdbInput: secretInput,
        hasServerMdblist: props.hasServerMdblist,
        hasProfileMdblist,
        mdblistInput: mdblistInput,
      }),
    [
      hasProfileMdblist,
      hasProfileTmdb,
      mdblistInput,
      props.hasServerMdblist,
      props.hasServerTmdb,
      secretInput,
    ],
  );
  const hasInstallTmdb = hasTmdbCredential(props.hasServerTmdb || hasProfileTmdb, secretInput);
  const hasInstallMdblist = hasMdblist || hasProfileMdblist;

  const missingKeyNames = useMemo(() => {
    const missing: string[] = [];
    if (!hasInstallTmdb) missing.push("TMDB");
    if (!hasInstallMdblist) missing.push("MDBList");
    return missing;
  }, [hasInstallMdblist, hasInstallTmdb]);

  const keysMissingReason = useMemo(() => {
    if (hasRequiredKeys) return null;
    if (missingKeyNames.length === 1) {
      return missingKeyNames[0] === "TMDB" ? "Add a TMDB key to save" : "Add an MDBList key to save";
    }
    return "Add TMDB and MDBList keys to save";
  }, [hasRequiredKeys, missingKeyNames]);

  const overlayKeysMessage = useMemo(() => {
    if (hasRequiredKeys) return null;
    return "TMDB and MDBList are both required for poster overlays. TMDB provides the poster and title details; MDBList provides ratings, trend labels, quality badges, and age labels. Add both keys on the API keys tab.";
  }, [hasRequiredKeys]);

  useEffect(() => {
    if (!catalogsHydrated) return;

    if (!setupHydrated) {
      setSetupHydrated(true);
      if (!hasRequiredKeys) setTab("keys");
    }
  }, [catalogsHydrated, setupHydrated, hasRequiredKeys]);

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

    let resetKey: ArtworkSourceKey = null;

    let nextArtwork = artwork;
    if (shouldAutoResetArtworkSource(artwork, artworkKeys)) {
      resetKey = artworkResetKey(POSTER_ARTWORK_UI_OPTIONS, artwork);
      nextArtwork = pickDefaultArtworkSource(artworkKeys);
    }

    let nextMovie = artworkMovie;
    if (shouldAutoResetArtworkMovieSource(artworkMovie, artworkKeys)) {
      resetKey ??= artworkResetKey(POSTER_ARTWORK_MOVIE_UI_OPTIONS, artworkMovie);
      nextMovie = pickDefaultArtworkMovieSource(artworkKeys);
    }

    let nextFb = overlay.artworkFallback;
    if (!fbOpt || !isArtworkKeySatisfied(fbOpt.key, artworkKeys)) {
      resetKey ??= fbOpt?.key ?? null;
      nextFb = "metahub";
    }

    if (
      nextArtwork !== overlay.artwork ||
      nextMovie !== overlay.artworkMovie ||
      nextFb !== overlay.artworkFallback
    ) {
      if (resetKey) setArtworkResetFrom(resetKey);
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
  const patterns = origin ? aiometadataArtPatterns(origin, queryString) : null;

  const keyChanges = useMemo(
    () => setupKeyChanges({ tmdb: secretInput, mdblist: mdblistInput }, sentKeyInputs),
    [mdblistInput, secretInput, sentKeyInputs],
  );
  const currentSnapshot = useMemo(
    () => setupSnapshot(queryString, selectedCatalogs, keyChanges),
    [keyChanges, queryString, selectedCatalogs],
  );
  const hasUnsavedChanges = hasUnsavedSetupChanges(savedSnapshot, currentSnapshot);

  useEffect(() => {
    if (!overlaySettled || !baselineSource) return;
    setSavedSnapshot(
      setupSnapshot(
        baselineSource.query,
        baselineSource.catalogs ?? selectedCatalogs,
        NO_KEY_CHANGES,
      ),
    );
    setBaselineSource(null);
  }, [baselineSource, overlaySettled, selectedCatalogs]);

  const artworkNotice =
    artworkResetFrom && !isArtworkKeySatisfied(artworkResetFrom, artworkKeys)
      ? (ARTWORK_KEY_NOTICE[artworkResetFrom] ?? null)
      : null;
  const catalogsMissingReason =
    overlaySettled && selectedCatalogs.length === 0 ? "Add at least one catalog" : null;
  const lockReason = keysMissingReason ?? catalogsMissingReason;

  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [hasUnsavedChanges]);

  const showChecklist = overlaySettled && (!configId || !hasRequiredKeys);
  const starterLookName = useMemo(
    () => STARTER_LOOKS.find((look) => matchesStarterLook(overlay, look))?.label ?? "Custom",
    [overlay],
  );

  const saveStatus: SetupSaveStatus = configSaving
    ? "saving"
    : !configExists || hasUnsavedChanges
      ? "dirty"
      : "saved";
  function handleSaveClick() {
    if (lockReason) return;
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
    const sentSnapshot = setupSnapshot(queryString, selectedCatalogs, NO_KEY_CHANGES);
    const sentKeys: SetupKeyInputs = { tmdb: secretInput.trim(), mdblist: mdblistInput.trim() };
    try {
      const integrator: { tmdbSecret?: string | null; mdblistApiKey?: string | null } = {};
      if (secretInput.trim()) integrator.tmdbSecret = secretInput.trim();
      if (mdblistInput.trim()) integrator.mdblistApiKey = mdblistInput.trim();

      const existingConfigId =
        !forceCreate && configExists && configId?.trim() ? configId.trim() : undefined;

      const body: Record<string, unknown> = {
        posterQuery: queryString,
        catalogs: selectedCatalogs,
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
      const data = (await res.json().catch(() => ({}))) as {
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
        const message =
          data.error ??
          (res.ok
            ? "Could not save config."
            : res.status >= 500
              ? `Could not save config (server error ${res.status}). Try again later.`
              : `Could not save config (HTTP ${res.status}).`);
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
      if (integrator.tmdbSecret) setConfigHasTmdbKey(true);
      if (integrator.mdblistApiKey) setConfigHasMdblistKey(true);
      setInstallUrl(stremioUserInstallUrl(origin, data.configId));
      setSavedSnapshot(sentSnapshot);
      setSentKeyInputs((prev) => ({
        tmdb: sentKeys.tmdb || prev.tmdb,
        mdblist: sentKeys.mdblist || prev.mdblist,
      }));
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
    <div className="polis-configure-page mx-auto max-w-5xl px-4 pt-8 sm:px-6">
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
        <p className="mt-1 text-sm text-zinc-400">
          {props.pageHint ?? "Tune posters, then copy install links."}
        </p>
      </header>

      {!origin ? (
        <p className="mb-6 rounded-lg border border-amber-900/40 bg-amber-950/25 px-4 py-3 text-sm text-amber-100/90">
          Set <code className="font-mono text-xs">POLIS_PUBLIC_URL</code> for public install links.
        </p>
      ) : null}

      {showChecklist ? (
        <SetupChecklist
          active={tab}
          catalogCount={selectedCatalogs.length}
          keysDetail={hasRequiredKeys ? "Ready" : `${missingKeyNames.join(" and ")} missing`}
          keysDone={hasRequiredKeys}
          lookDone={configExists || lookTouched}
          lookName={starterLookName}
          onSelect={setTab}
        />
      ) : null}

      <SetupTabs active={tab} onChange={setTab} />

      {tab === "style" && overlayKeysMessage ? (
        <KeysRequiredNotice message={overlayKeysMessage} onGoToKeys={() => setTab("keys")} />
      ) : null}

      {tab === "style" && artworkNotice ? (
        <KeysRequiredNotice message={artworkNotice} onGoToKeys={() => setTab("keys")} />
      ) : null}

      {tab === "style" ? (
        <>
          <div className="flex flex-col gap-8 lg:flex-row lg:items-start">
          <div className="min-w-0 flex-1">
          <SetupLooks
            initialLookCode={overlaySettled ? lookCodeParam : null}
            onChange={changeOverlay}
            onLookLinkConsumed={consumeLookLink}
            origin={origin}
            overlay={overlay}
            previewOverlay={debouncedOverlay}
          />
          <SetupOverlayPanel
            artworkControls={
              <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-sm text-zinc-300">
                Poster art source
                {overlay.artwork === "tvdb" ? " (TV series)" : ""}
              </span>
              <select
                className="polis-select w-full"
                onChange={(e) => {
                  const artwork = e.target.value as PosterArtworkSource;
                  changeArtwork((o) => ({
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
              <label className="block">
                <span className="mb-1.5 block text-sm text-zinc-300">Movie poster source</span>
                <select
                  className="polis-select w-full"
                  onChange={(e) =>
                    changeArtwork((o) => ({
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
            <label className="block">
              <span className="mb-1.5 block text-sm text-zinc-300">Poster fallback</span>
              <select
                className="polis-select w-full"
                onChange={(e) =>
                  changeArtwork((o) => ({
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
              </div>
            }
            overlay={overlay}
            setOverlay={changeOverlay}
          />
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
            landscape={overlay.posterShape === "landscape"}
            overlayQueryString={previewOverlayQuery}
            showcaseQueryString={showcaseQueryString}
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
          onGoToKeys={() => setTab("keys")}
          onChange={setCatalogSelection}
          selected={selectedCatalogs}
        />
      ) : null}

      <SetupSaveBar
        error={configError}
        installUrl={installUrl}
        lockAction={
          keysMissingReason
            ? { label: "Go to API keys", onClick: () => setTab("keys") }
            : catalogsMissingReason && tab !== "catalogs"
              ? { label: "Go to catalogs", onClick: () => setTab("catalogs") }
              : null
        }
        lockReason={lockReason}
        onSave={handleSaveClick}
        landscapePattern={patterns?.landscapePattern ?? null}
        posterPattern={patterns?.posterPattern ?? null}
        saveLabel={configId ? "Save" : "Create profile"}
        saving={configSaving}
        status={saveStatus}
      />
    </div>
  );
}

function KeysRequiredNotice(props: { message: string; onGoToKeys: () => void }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3">
      <p className="min-w-0 flex-1 text-sm text-amber-100/95">{props.message}</p>
      <button className="polis-btn-secondary" onClick={props.onGoToKeys} type="button">
        Go to API keys
      </button>
    </div>
  );
}
