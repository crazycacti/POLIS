import type { NextRequest } from "next/server";

export type ResolvedMdblistAuth = {
  apiKey: string;
  embedInArtworkUrls: boolean;
};

export function mdblistAuthToSearchParams(apiKey: string): URLSearchParams {
  const p = new URLSearchParams();
  p.set("mdblist_api_key", apiKey);
  return p;
}

export function resolveMdblistAuth(request: NextRequest): ResolvedMdblistAuth | null {
  const q = request.nextUrl.searchParams;
  const fromQuery = q.get("mdblist_api_key")?.trim() || q.get("mdblist_key")?.trim();
  if (fromQuery) {
    return { apiKey: fromQuery, embedInArtworkUrls: true };
  }

  const envKey = process.env.MDBLIST_API_KEY?.trim();
  if (envKey) {
    return { apiKey: envKey, embedInArtworkUrls: false };
  }

  return null;
}

export function mergePosterQueryWithMdblistAuth(
  posterQueryString: string,
  mdblistParams: URLSearchParams | undefined,
): string {
  const merged = new URLSearchParams(posterQueryString);
  if (mdblistParams) {
    mdblistParams.forEach((value, key) => {
      merged.set(key, value);
    });
  }
  return merged.toString();
}
