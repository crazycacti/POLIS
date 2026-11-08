import { posterContentType, posterDiskExtension } from "@/lib/poster-output-format";
import { POLIS_RENDERER_REVISION } from "@/lib/polis-renderer";
import { polisSingleflight } from "@/lib/polis-singleflight";
import { renderPosterForImdb } from "@/lib/poster-pipeline";
import { serializePosterQuery, type PosterOverlayQuery } from "@/lib/poster-query";
import { withLiveTrendRank } from "@/lib/poster-render-cache";
import {
  cachedPreviewThumb,
  cachedPreviewThumbExists,
  PREVIEW_THUMB_CONTENT_TYPE,
  previewCachedPath,
  readPreviewCacheFile,
  TITLE_PREVIEW_STORE,
  writePreviewCache,
  type PreviewFullLoad,
  type PreviewImage,
  type PreviewThumbWidth,
} from "@/lib/preview-image-cache";
import { previewProvidersTag, type PreviewCallerKeys } from "@/lib/preview-keys";
import { PREVIEW_SERVER_KEY_PROFILE } from "@/lib/stremio-integrator-auth";
import { previewRenderBudget, type PreviewRenderBudget, type PreviewRenderKeySource } from "@/lib/preview-render-budget";
import { tmdbCredentialFromRaw } from "@/lib/tmdb-credential-infer";
import { serverTmdbCredential, type TmdbCredential } from "@/lib/tmdb-server-credential";
import { parseTvdbCredentials, type TvdbCredentials } from "@/lib/tvdb-credentials";

export const PREVIEW_RENDER_TTL_SEC = 24 * 60 * 60;

const PREVIEW_TITLE_SCOPE = "titles";
const PREVIEW_RENDER_TTL_MS = PREVIEW_RENDER_TTL_SEC * 1000;

export type PreviewProviders = { tmdb: boolean; mdblist: boolean; fanart: boolean; tvdb: boolean };

export type PreviewAuth = {
  credential: TmdbCredential | null;
  mdblistApiKey: string | null;
  fanartApiKey: string | null;
  tvdbCredentials: TvdbCredentials | null;
  providers: PreviewProviders;
  keySource: PreviewRenderKeySource;
  mdblistUsesServerKey: boolean;
};

function serverEnv(name: string): string | null {
  return process.env[name]?.trim() || null;
}

export function resolvePreviewAuth(caller: PreviewCallerKeys): PreviewAuth {
  const callerTmdb = caller.tmdb ? tmdbCredentialFromRaw(caller.tmdb) : null;
  const serverTmdb = callerTmdb ? null : serverTmdbCredential();
  const serverMdblist = caller.mdblist ? null : serverEnv("MDBLIST_API_KEY");
  const serverFanart = caller.fanart ? null : serverEnv("FANART_API_KEY");
  const callerTvdb = caller.tvdb ? parseTvdbCredentials(caller.tvdb) : null;
  const serverTvdbRaw = callerTvdb ? null : serverEnv("TVDB_API_KEY");
  const serverTvdb = serverTvdbRaw ? parseTvdbCredentials(serverTvdbRaw) : null;

  const credential = callerTmdb ?? serverTmdb;
  const mdblistApiKey = caller.mdblist ?? serverMdblist;
  const fanartApiKey = caller.fanart ?? serverFanart;
  const tvdbCredentials = callerTvdb ?? serverTvdb;
  const usesServerKey = Boolean(serverTmdb || serverMdblist || serverFanart || serverTvdb);
  return {
    credential,
    mdblistApiKey,
    fanartApiKey,
    tvdbCredentials,
    providers: {
      tmdb: credential != null,
      mdblist: mdblistApiKey != null,
      fanart: fanartApiKey != null,
      tvdb: tvdbCredentials != null,
    },
    keySource: usesServerKey ? "server" : "caller",
    mdblistUsesServerKey: serverMdblist != null,
  };
}

export function previewRenderCacheKey(params: {
  imdbId: string;
  overlay: PosterOverlayQuery;
  language: string;
  providers: PreviewProviders;
}): string {
  return [
    String(POLIS_RENDERER_REVISION),
    params.language,
    params.imdbId,
    serializePosterQuery(params.overlay),
    previewProvidersTag(params.providers),
  ].join("\0");
}

const KEYLESS_PROVIDER_CANDIDATES: PreviewProviders[] = [true, false]
  .flatMap((mdblist) =>
    [true, false].flatMap((fanart) => [true, false].map((tvdb) => ({ tmdb: true, mdblist, fanart, tvdb }))),
  )
  .sort((a, b) => Number(b.mdblist) + Number(b.fanart) + Number(b.tvdb) - (Number(a.mdblist) + Number(a.fanart) + Number(a.tvdb)));

export type PreviewFailure = { kind: "not_found" } | { kind: "limited"; retryAfterSec: number };

type FullOutcome = PreviewFullLoad<PreviewFailure>;

export type PreviewPosterResult =
  | { kind: "image"; image: PreviewImage; contentType: string; degraded: boolean }
  | { kind: "uncached" }
  | PreviewFailure;

type PreviewRequest = {
  imdbId: string;
  overlay: PosterOverlayQuery;
  width: PreviewThumbWidth | null;
  auth: PreviewAuth;
  language: string;
  clientKey: string;
  budget?: PreviewRenderBudget;
  countAgainstBudget?: boolean;
};

function fullPath(fullKey: string): Promise<string | null> {
  return previewCachedPath(TITLE_PREVIEW_STORE, PREVIEW_TITLE_SCOPE, fullKey, posterDiskExtension(), PREVIEW_RENDER_TTL_MS);
}

async function cachedFull(fullKey: string): Promise<FullOutcome> {
  const path = await fullPath(fullKey);
  const image = path ? await readPreviewCacheFile(path) : null;
  return image ? { kind: "full", image, cacheable: true } : null;
}

async function renderFull(request: PreviewRequest, fullKey: string, credential: TmdbCredential): Promise<FullOutcome> {
  return polisSingleflight(`preview:${fullKey}`, async (): Promise<FullOutcome> => {
    const raced = await cachedFull(fullKey);
    if (raced) return raced;

    const budget = request.budget ?? previewRenderBudget;
    const source = request.auth.keySource;
    if (request.countAgainstBudget !== false && !budget.take(source, request.clientKey)) {
      return { kind: "failed", failure: { kind: "limited", retryAfterSec: budget.retryAfterSec(source, request.clientKey) } };
    }

    const overlay = await withLiveTrendRank({
      imdbId: request.imdbId,
      overlay: request.overlay,
      credential,
      language: request.language,
    });
    let degraded = false;
    const image = await renderPosterForImdb({
      imdbId: request.imdbId,
      overlay,
      credential,
      language: request.language,
      mdblistApiKey: request.auth.mdblistApiKey,
      mdblistServerKeyProfile: request.auth.mdblistUsesServerKey ? PREVIEW_SERVER_KEY_PROFILE : null,
      fanartApiKey: request.auth.fanartApiKey,
      tvdbCredentials: request.auth.tvdbCredentials,
      configId: null,
      onDegraded: () => {
        degraded = true;
      },
    });
    if (!image) return { kind: "failed", failure: { kind: "not_found" } };
    if (!degraded) {
      await writePreviewCache(TITLE_PREVIEW_STORE, PREVIEW_TITLE_SCOPE, fullKey, posterDiskExtension(), image).catch(
        (error: unknown) => console.warn(`[polis] preview cache write failed for ${request.imdbId}`, error),
      );
    }
    return { kind: "full", image, cacheable: !degraded };
  });
}

async function previewForKey(
  request: PreviewRequest,
  fullKey: string,
  keyed: boolean,
  loadFull: () => Promise<FullOutcome>,
): Promise<PreviewPosterResult | null> {
  if (request.width == null) {
    const path = await fullPath(fullKey);
    if (path) return { kind: "image", image: { source: "disk", path }, contentType: posterContentType(), degraded: false };
    const full = await loadFull();
    if (!full) return null;
    if (full.kind === "failed") return full.failure;
    return {
      kind: "image",
      image: { source: "buffer", image: full.image, cacheable: full.cacheable },
      contentType: posterContentType(),
      degraded: !full.cacheable,
    };
  }

  const thumb = await cachedPreviewThumb({
    store: TITLE_PREVIEW_STORE,
    scope: PREVIEW_TITLE_SCOPE,
    fullKey,
    width: request.width,
    ttlMs: PREVIEW_RENDER_TTL_MS,
    flightTag: keyed ? "keyed" : "keyless",
    loadFull,
  });
  if (!thumb) return null;
  if (thumb.source === "failed") return thumb.failure;
  return {
    kind: "image",
    image: thumb,
    contentType: PREVIEW_THUMB_CONTENT_TYPE,
    degraded: thumb.source === "buffer" && !thumb.cacheable,
  };
}

export async function previewPoster(request: PreviewRequest): Promise<PreviewPosterResult> {
  const keyFor = (providers: PreviewProviders) =>
    previewRenderCacheKey({ imdbId: request.imdbId, overlay: request.overlay, language: request.language, providers });

  const credential = request.auth.credential;
  if (!credential) {
    for (const providers of KEYLESS_PROVIDER_CANDIDATES) {
      const fullKey = keyFor(providers);
      const hit = await previewForKey(request, fullKey, false, () => cachedFull(fullKey));
      if (hit) return hit;
    }
    return { kind: "uncached" };
  }

  const fullKey = keyFor(request.auth.providers);
  const result = await previewForKey(
    request,
    fullKey,
    true,
    async () => (await cachedFull(fullKey)) ?? renderFull(request, fullKey, credential),
  );
  return result ?? { kind: "not_found" };
}

export async function previewPosterCached(
  request: Pick<PreviewRequest, "imdbId" | "overlay" | "width" | "auth" | "language">,
): Promise<boolean> {
  if (!request.auth.credential) return false;
  const fullKey = previewRenderCacheKey({
    imdbId: request.imdbId,
    overlay: request.overlay,
    language: request.language,
    providers: request.auth.providers,
  });
  if (request.width == null) return (await fullPath(fullKey)) != null;
  return cachedPreviewThumbExists(TITLE_PREVIEW_STORE, PREVIEW_TITLE_SCOPE, fullKey, request.width, PREVIEW_RENDER_TTL_MS);
}
