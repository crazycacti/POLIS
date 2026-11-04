const ARTWORK_HOST_DOMAINS = [
  "tmdb.org",
  "metahub.space",
  "fanart.tv",
  "thetvdb.com",
  "anilist.co",
  "kitsu.app",
  "kitsu.io",
  "myanimelist.net",
] as const;

export const ARTWORK_MAX_BYTES = 20 * 1024 * 1024;

function hostMatchesDomain(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

// Artwork URLs come from third-party API responses and are fetched server side,
// so only https URLs on the known image CDNs are allowed.
export function parseAllowedArtworkUrl(raw: string): URL | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  if (url.port && url.port !== "443") return null;
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  return ARTWORK_HOST_DOMAINS.some((domain) => hostMatchesDomain(host, domain)) ? url : null;
}

export async function readArtworkResponseBytes(
  response: Response,
  maxBytes = ARTWORK_MAX_BYTES,
): Promise<Buffer | null> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await response.body?.cancel();
    return null;
  }
  if (!response.body) return null;

  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = response.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return total > 0 ? Buffer.concat(chunks) : null;
}

const ARTWORK_MAX_REDIRECTS = 3;
const ARTWORK_DOWNLOAD_TIMEOUT_MS = 20_000;

export async function fetchArtworkBytes(
  raw: string,
  fetchFn: (url: URL, init: RequestInit) => Promise<Response>,
): Promise<Buffer | null> {
  let url = parseAllowedArtworkUrl(raw);
  const signal = AbortSignal.timeout(ARTWORK_DOWNLOAD_TIMEOUT_MS);
  for (let hop = 0; url && hop <= ARTWORK_MAX_REDIRECTS; hop += 1) {
    const response = await fetchFn(url, { redirect: "manual", signal });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      await response.body?.cancel();
      url = location ? parseAllowedArtworkUrl(new URL(location, url).toString()) : null;
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel();
      return null;
    }
    return readArtworkResponseBytes(response);
  }
  return null;
}
