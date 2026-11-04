import { ensurePolisSharpConfigured } from "@/lib/polis-sharp-config";
import { fetchUpstream } from "@/lib/upstream-fetch";
import sharp from "sharp";

export type TmdbLogoSize = "w500" | "original";

export async function renderLogoPng(
  logoPath: string | null,
  size: TmdbLogoSize = "original",
): Promise<Buffer | null> {
  ensurePolisSharpConfigured();
  if (!logoPath) return null;
  const url = `https://image.tmdb.org/t/p/${size}${logoPath}`;
  const res = await fetchUpstream(url, { revalidateSeconds: 86400 });
  if (!res.ok) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  const meta = await sharp(buf).metadata();
  const w = meta.width ?? 400;
  if (w <= 800) {
    return sharp(buf).png().toBuffer();
  }
  return sharp(buf)
    .resize({
      width: 800,
      fit: "inside",
      withoutEnlargement: false,
    })
    .png()
    .toBuffer();
}
