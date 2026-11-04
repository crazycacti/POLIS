import { ensurePolisSharpConfigured } from "@/lib/polis-sharp-config";
import { posterEncodeFormat } from "@/lib/poster-output-format";
import sharp from "sharp";

// Measured on rendered posters: about 17% smaller than q86 at the same encode time.
const WEBP_QUALITY = 80;
const WEBP_EFFORT = 5;

export async function encodePosterImage(baseBuf: Buffer): Promise<Buffer> {
  ensurePolisSharpConfigured();
  if (posterEncodeFormat() === "jpeg") {
    return sharp(baseBuf).jpeg({ quality: 88, mozjpeg: true }).toBuffer();
  }
  return sharp(baseBuf)
    .webp({ quality: WEBP_QUALITY, effort: WEBP_EFFORT, smartSubsample: true })
    .toBuffer();
}
