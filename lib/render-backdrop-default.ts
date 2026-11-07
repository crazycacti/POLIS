import { ensurePolisSharpConfigured } from "@/lib/polis-sharp-config";
import { fetchUpstream, IMAGE_FETCH_TIMEOUT_MS } from "@/lib/upstream-fetch";
import { upstreamNextRevalidateSeconds } from "@/lib/upstream-json-cache";
import sharp from "sharp";

const TMDB_BACKDROP_TTL_MS = 24 * 60 * 60 * 1000;

export async function renderBackdropJpeg(backdropPath: string | null): Promise<Buffer | null> {
  ensurePolisSharpConfigured();
  if (!backdropPath) return null;
  const url = `https://image.tmdb.org/t/p/original${backdropPath}`;
  const res = await fetchUpstream(url, {
    revalidateSeconds: upstreamNextRevalidateSeconds(TMDB_BACKDROP_TTL_MS),
    timeoutMs: IMAGE_FETCH_TIMEOUT_MS,
  });
  if (!res.ok) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  return sharp(buf)
    .resize({
      width: 1920,
      height: 1080,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 85, mozjpeg: true })
    .toBuffer();
}
