import { fetchArtworkBytes } from "@/lib/artwork-url-allow";
import { ensurePolisSharpConfigured } from "@/lib/polis-sharp-config";
import { fetchUpstream, IMAGE_FETCH_TIMEOUT_MS } from "@/lib/upstream-fetch";
import sharp from "sharp";

export type TmdbLogoSize = "w500" | "original";

const LOGO_MAX_WIDTH = 800;
const LOGO_FALLBACK_WIDTH = 400;
const TMDB_LOGO_REVALIDATE_SECONDS = 86400;

export function isTmdbLogoPath(logoRef: string): boolean {
  return logoRef.startsWith("/");
}

async function fetchLogoBytes(logoRef: string, size: TmdbLogoSize): Promise<Buffer | null> {
  if (!isTmdbLogoPath(logoRef)) {
    return fetchArtworkBytes(logoRef, (target, init) => fetchUpstream(target, init));
  }
  const url = `https://image.tmdb.org/t/p/${size}${logoRef}`;
  const res = await fetchUpstream(url, {
    revalidateSeconds: TMDB_LOGO_REVALIDATE_SECONDS,
    timeoutMs: IMAGE_FETCH_TIMEOUT_MS,
  });
  if (!res.ok) return null;
  return Buffer.from(await res.arrayBuffer());
}

export async function renderLogoPng(
  logoRef: string | null,
  size: TmdbLogoSize = "original",
): Promise<Buffer | null> {
  ensurePolisSharpConfigured();
  if (!logoRef) return null;
  const buf = await fetchLogoBytes(logoRef, size);
  if (!buf) return null;
  const meta = await sharp(buf).metadata();
  const w = meta.width ?? LOGO_FALLBACK_WIDTH;
  if (w <= LOGO_MAX_WIDTH) {
    return sharp(buf).png().toBuffer();
  }
  return sharp(buf)
    .resize({
      width: LOGO_MAX_WIDTH,
      fit: "inside",
      withoutEnlargement: false,
    })
    .png()
    .toBuffer();
}
