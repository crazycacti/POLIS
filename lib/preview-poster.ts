import { readFile } from "node:fs/promises";

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
  writePreviewCache,
  type PreviewImage,
  type PreviewThumbWidth,
} from "@/lib/preview-image-cache";
import { previewProvidersTag, type PreviewCallerKeys } from "@/lib/preview-keys";
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

type FullOutcome =
  | { kind: "full"; image: Buffer; cacheable: boolean }
  | { kind: "failed"; failure: PreviewFailure };

export type PreviewFailure = { kind: "not_found" } | { kind: "limited"; retryAfterSec: number };

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
  budget?: PreviewRenderBudget;
  countAgainstBudget?: boolean;
};

async function renderFull(request: PreviewRequest, fullKey: string, credential: TmdbCredential): Promise<FullOutcome> {
  const ext = posterDiskExtension();
  return polisSingleflight(`preview:${fullKey}`, async (): Promise<FullOutcome> => {
    const raced = await previewCachedPath(PREVIEW_TITLE_SCOPE, fullKey, ext, PREVIEW_RENDER_TTL_MS);
    if (raced) return { kind: "full", image: await readFile(raced), cacheable: true };

    const budget = request.budget ?? previewRenderBudget;
    if (request.countAgainstBudget !== false && !budget.take(request.auth.keySource)) {
      return { kind: "failed", failure: { kind: "limited", retryAfterSec: budget.retryAfterSec(request.auth.keySource) } };
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
      mdblistServerKeyProfile: null,
      fanartApiKey: request.auth.fanartApiKey,
      tvdbCredentials: request.auth.tvdbCredentials,
      configId: null,
      onDegraded: () => {
        degraded = true;
      },
    });
    if (!image) return { kind: "failed", failure: { kind: "not_found" } };
    if (!degraded) {
      await writePreviewCache(PREVIEW_TITLE_SCOPE, fullKey, ext, image).catch((error: unknown) =>
        console.warn(`[polis] preview cache write failed for ${request.imdbId}`, error),
      );
    }
    return { kind: "full", image, cacheable: !degraded };
  });
}

async function cachedFull(fullKey: string): Promise<FullOutcome | null> {
  const path = await previewCachedPath(PREVIEW_TITLE_SCOPE, fullKey, posterDiskExtension(), PREVIEW_RENDER_TTL_MS);
  return path ? { kind: "full", image: await readFile(path), cacheable: true } : null;
}

async function previewForKey(
  request: PreviewRequest,
  fullKey: string,
  loadFull: () => Promise<FullOutcome | null>,
): Promise<PreviewPosterResult | null> {
  if (request.width == null) {
    const path = await previewCachedPath(PREVIEW_TITLE_SCOPE, fullKey, posterDiskExtension(), PREVIEW_RENDER_TTL_MS);
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

  const outcome: { failure: PreviewFailure | null } = { failure: null };
  const thumb = await cachedPreviewThumb({
    scope: PREVIEW_TITLE_SCOPE,
    fullKey,
    width: request.width,
    ttlMs: PREVIEW_RENDER_TTL_MS,
    loadFull: async () => {
      const full = await loadFull();
      if (!full) return null;
      if (full.kind === "failed") {
        outcome.failure = full.failure;
        return null;
      }
      return full;
    },
  });
  if (outcome.failure) return outcome.failure;
  if (!thumb) return null;
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
      const hit = await previewForKey(request, fullKey, () => cachedFull(fullKey));
      if (hit) return hit;
    }
    return { kind: "uncached" };
  }

  const fullKey = keyFor(request.auth.providers);
  const result = await previewForKey(
    request,
    fullKey,
    async () => (await cachedFull(fullKey)) ?? renderFull(request, fullKey, credential),
  );
  return result ?? { kind: "not_found" };
}

export async function previewPosterCached(request: Omit<PreviewRequest, "budget" | "countAgainstBudget">): Promise<boolean> {
  if (!request.auth.credential) return false;
  const fullKey = previewRenderCacheKey({
    imdbId: request.imdbId,
    overlay: request.overlay,
    language: request.language,
    providers: request.auth.providers,
  });
  if (request.width == null) {
    return (await previewCachedPath(PREVIEW_TITLE_SCOPE, fullKey, posterDiskExtension(), PREVIEW_RENDER_TTL_MS)) != null;
  }
  return cachedPreviewThumbExists(PREVIEW_TITLE_SCOPE, fullKey, request.width, PREVIEW_RENDER_TTL_MS);
}
