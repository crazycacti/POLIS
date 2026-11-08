import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

import type { RatingBadgeSource } from "@/lib/ratings";

const LOGO_DIRS = [
  path.join(process.cwd(), "public", "rating-logos"),
  path.join(process.cwd(), "rating-logos"),
];

const logoCache = new Map<RatingBadgeSource, Buffer | null>();

async function loadLogoAsset(source: RatingBadgeSource): Promise<Buffer | null> {
  if (logoCache.has(source)) return logoCache.get(source) ?? null;
  for (const dir of LOGO_DIRS) {
    try {
      const buf = await readFile(path.join(/*turbopackIgnore: true*/ dir, `${source}.png`));
      logoCache.set(source, buf);
      return buf;
    } catch {
      continue;
    }
  }
  logoCache.set(source, null);
  return null;
}

export async function loadRatingLogo(
  source: RatingBadgeSource,
  height: number,
): Promise<{ buf: Buffer; width: number; height: number } | null> {
  const asset = await loadLogoAsset(source);
  if (!asset) return null;
  const target = Math.max(1, Math.round(height));
  const buf = await sharp(asset).resize({ height: target }).png().toBuffer();
  const meta = await sharp(buf).metadata();
  return { buf, width: meta.width ?? target, height: meta.height ?? target };
}
