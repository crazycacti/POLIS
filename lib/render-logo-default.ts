import { fetchArtworkBytes } from "@/lib/artwork-url-allow";
import { ensurePolisSharpConfigured } from "@/lib/polis-sharp-config";
import { readPolisDiskBytes, writePolisDiskBytes } from "@/lib/polis-disk-cache";
import { type CpuStage, runWithoutRenderLimit } from "@/lib/polis-render-limit";
import { polisSingleflight } from "@/lib/polis-singleflight";
import { fetchUpstream, IMAGE_FETCH_TIMEOUT_MS } from "@/lib/upstream-fetch";
import { upstreamNextRevalidateSeconds } from "@/lib/upstream-json-cache";
import sharp from "sharp";

export type TmdbLogoSize = "w500" | "original";

const LOGO_MAX_WIDTH = 800;
const LOGO_FALLBACK_WIDTH = 400;
const TMDB_LOGO_TTL_MS = 24 * 60 * 60 * 1000;
const TMDB_LOGO_NAMESPACE = "logo-source";
const TMDB_LOGO_SCOPE = "g";
const TMDB_LOGO_EXT = ".img";

export function isTmdbLogoPath(logoRef: string): boolean {
  return logoRef.startsWith("/");
}

async function fetchLogoBytes(logoRef: string, size: TmdbLogoSize): Promise<Buffer | null> {
  if (!isTmdbLogoPath(logoRef)) {
    return fetchArtworkBytes(logoRef, (target, init) => fetchUpstream(target, init));
  }
  const cacheKey = `${size}${logoRef}`;
  const cached = await readPolisDiskBytes(TMDB_LOGO_NAMESPACE, TMDB_LOGO_SCOPE, cacheKey, TMDB_LOGO_EXT, TMDB_LOGO_TTL_MS);
  if (cached) return cached;
  return polisSingleflight(`${TMDB_LOGO_NAMESPACE}:${cacheKey}`, async () => {
    const url = `https://image.tmdb.org/t/p/${size}${logoRef}`;
    const res = await fetchUpstream(url, {
      revalidateSeconds: upstreamNextRevalidateSeconds(TMDB_LOGO_TTL_MS),
      timeoutMs: IMAGE_FETCH_TIMEOUT_MS,
    });
    if (!res.ok) {
      await res.body?.cancel();
      return null;
    }
    const bytes = Buffer.from(await res.arrayBuffer());
    void writePolisDiskBytes(TMDB_LOGO_NAMESPACE, TMDB_LOGO_SCOPE, cacheKey, TMDB_LOGO_EXT, bytes).catch(
      (error: unknown) => console.warn(`[polis] logo cache write failed for ${logoRef}`, error),
    );
    return bytes;
  });
}

export async function renderLogoPng(
  logoRef: string | null,
  size: TmdbLogoSize = "original",
  cpuStage: CpuStage = runWithoutRenderLimit,
): Promise<Buffer | null> {
  ensurePolisSharpConfigured();
  if (!logoRef) return null;
  const buf = await fetchLogoBytes(logoRef, size);
  if (!buf) return null;
  return cpuStage(() => normalizeLogoPng(buf));
}

async function normalizeLogoPng(buf: Buffer): Promise<Buffer> {
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
