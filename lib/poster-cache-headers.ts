export function posterHttpCacheControl(): string {
  if (process.env.NODE_ENV === "development") {
    return "no-store, no-cache, must-revalidate";
  }
  return "public, max-age=3600, stale-while-revalidate=86400, stale-if-error=86400";
}

export function demoPosterHttpCacheControl(): string {
  if (process.env.NODE_ENV === "development") {
    return "public, max-age=300, stale-while-revalidate=3600";
  }
  return "public, max-age=86400, stale-while-revalidate=604800, stale-if-error=86400, immutable";
}
