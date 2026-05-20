import { ensurePolisSharpConfigured } from "@/lib/polis-sharp-config";
import { fetchUpstream } from "@/lib/upstream-fetch";
import sharp from "sharp";

export async function renderBackdropJpeg(backdropPath: string | null): Promise<Buffer | null> {
  ensurePolisSharpConfigured();
  if (!backdropPath) return null;
  const url = `https://image.tmdb.org/t/p/original${backdropPath}`;
  const res = await fetchUpstream(url, { revalidateSeconds: 86400 });
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
