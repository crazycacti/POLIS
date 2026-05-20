import { parsePosterOverlayQuery, serializePosterQuery } from "@/lib/poster-query";

const NON_OVERLAY_QUERY_KEYS = new Set([
  "polis_r",
  "api_key",
  "tmdb_access_token",
  "mdblist_api_key",
  "mdblist_key",
  "fanart_api_key",
  "tvdb_api_key",
]);

export function overlayQueryStringFromRaw(rawQueryString: string): string {
  const params = new URLSearchParams(rawQueryString);
  for (const key of NON_OVERLAY_QUERY_KEYS) {
    params.delete(key);
  }
  return serializePosterQuery(parsePosterOverlayQuery(params));
}

export function demoPosterCacheKey(demoId: string, rawQueryString: string): string {
  return `${demoId}:${overlayQueryStringFromRaw(rawQueryString)}`;
}
