import { fanartAuthToSearchParams } from "@/lib/fanart-auth";
import { mdblistAuthToSearchParams, mergePosterQueryWithMdblistAuth } from "@/lib/mdblist-auth";
import { tvdbAuthToSearchParams } from "@/lib/tvdb-auth";
import { parseTvdbCredentials } from "@/lib/tvdb-credentials";
import { mergePosterQueryWithAuth } from "@/lib/tmdb-auth";
import type { TmdbCredential } from "@/lib/tmdb-auth";
import { tmdbAuthToSearchParams } from "@/lib/tmdb-auth";

export type IntegratorArtworkKeys = {
  mdblistApiKey?: string | null;
  fanartApiKey?: string | null;
  tvdbApiKey?: string | null;
};

export type ServerIntegratorKeyAvailability = {
  hasServerTmdb: boolean;
  hasServerMdblist: boolean;
  hasServerFanart: boolean;
  hasServerTvdb: boolean;
};

export function mergePosterQueryForConfigurePreview(
  posterQueryString: string,
  server: ServerIntegratorKeyAvailability,
  tmdbAuth: URLSearchParams | undefined,
  artworkKeys: IntegratorArtworkKeys,
): string {
  return mergePosterQueryWithIntegratorAuth(
    posterQueryString,
    server.hasServerTmdb ? undefined : tmdbAuth,
    {
      mdblistApiKey: server.hasServerMdblist ? null : artworkKeys.mdblistApiKey,
      fanartApiKey: server.hasServerFanart ? null : artworkKeys.fanartApiKey,
      tvdbApiKey: server.hasServerTvdb ? null : artworkKeys.tvdbApiKey,
    },
  );
}

export function mergePosterQueryWithIntegratorAuth(
  posterQueryString: string,
  tmdbAuth?: URLSearchParams,
  artworkKeys?: IntegratorArtworkKeys,
): string {
  let merged = mergePosterQueryWithAuth(posterQueryString, tmdbAuth);
  const mdblist = artworkKeys?.mdblistApiKey?.trim();
  if (mdblist) {
    merged = mergePosterQueryWithMdblistAuth(merged, mdblistAuthToSearchParams(mdblist));
  }
  const fanart = artworkKeys?.fanartApiKey?.trim();
  if (fanart) {
    const p = new URLSearchParams(merged);
    fanartAuthToSearchParams(fanart).forEach((value, key) => p.set(key, value));
    merged = p.toString();
  }
  const tvdb = artworkKeys?.tvdbApiKey?.trim();
  if (tvdb) {
    const credentials = parseTvdbCredentials(tvdb);
    if (credentials) {
      const p = new URLSearchParams(merged);
      tvdbAuthToSearchParams(credentials).forEach((value, key) => p.set(key, value));
      merged = p.toString();
    }
  }
  return merged;
}

export type ArtworkAuthBundle = {
  tmdbParams?: URLSearchParams;
  mdblistApiKey: string | null;
  fanartApiKey: string | null;
  tvdbApiKey: string | null;
};

export function artworkAuthFromCredential(
  credential: TmdbCredential,
  embedInUrls: boolean,
  artworkKeys: IntegratorArtworkKeys,
): ArtworkAuthBundle {
  return {
    tmdbParams: embedInUrls ? tmdbAuthToSearchParams(credential) : undefined,
    mdblistApiKey: artworkKeys.mdblistApiKey?.trim() ?? null,
    fanartApiKey: artworkKeys.fanartApiKey?.trim() ?? null,
    tvdbApiKey: artworkKeys.tvdbApiKey?.trim() ?? null,
  };
}
