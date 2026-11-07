const POSTER_MAX_AGE_SEC = 6 * 60 * 60;
const POSTER_STALE_SEC = 24 * 60 * 60;

export function posterHttpCacheControl(): string {
  if (process.env.NODE_ENV === "development") {
    return "no-store, no-cache, must-revalidate";
  }
  return `public, max-age=${POSTER_MAX_AGE_SEC}, stale-while-revalidate=${POSTER_STALE_SEC}, stale-if-error=${POSTER_STALE_SEC}`;
}

export function degradedPosterHttpCacheControl(maxAgeSec: number): string {
  if (process.env.NODE_ENV === "development") {
    return "no-store, no-cache, must-revalidate";
  }
  return `public, max-age=${maxAgeSec}`;
}

export function previewPosterHttpCacheControl(degradedMaxAgeSec?: number): string {
  if (process.env.NODE_ENV === "development") {
    return "no-store, no-cache, must-revalidate";
  }
  if (degradedMaxAgeSec != null) return `private, max-age=${degradedMaxAgeSec}`;
  return `private, max-age=${POSTER_MAX_AGE_SEC}, stale-while-revalidate=${POSTER_STALE_SEC}`;
}

export function demoPosterHttpCacheControl(): string {
  if (process.env.NODE_ENV === "development") {
    return "public, max-age=300, stale-while-revalidate=3600";
  }
  return "public, max-age=86400, stale-while-revalidate=604800, stale-if-error=86400, immutable";
}
