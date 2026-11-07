import { ensurePolisSharpConfigured } from "@/lib/polis-sharp-config";
import { posterEncodeFormat } from "@/lib/poster-output-format";
import sharp from "sharp";

const WEBP_QUALITY = 80;
const WEBP_EFFORT = 5;
const JPEG_QUALITY = 88;
const BUDGET_QUALITY_STEP = 10;
const BUDGET_QUALITY_FLOOR = 50;

async function encodeAtQuality(baseBuf: Buffer, webpQuality: number, jpegQuality: number): Promise<Buffer> {
  if (posterEncodeFormat() === "jpeg") {
    return sharp(baseBuf).jpeg({ quality: jpegQuality, mozjpeg: true }).toBuffer();
  }
  return sharp(baseBuf)
    .webp({ quality: webpQuality, effort: WEBP_EFFORT, smartSubsample: true })
    .toBuffer();
}

export async function encodePosterImage(baseBuf: Buffer): Promise<Buffer> {
  ensurePolisSharpConfigured();
  return encodeAtQuality(baseBuf, WEBP_QUALITY, JPEG_QUALITY);
}

export async function encodePosterImageWithinBudget(baseBuf: Buffer, maxBytes: number): Promise<Buffer> {
  ensurePolisSharpConfigured();
  let out = await encodeAtQuality(baseBuf, WEBP_QUALITY, JPEG_QUALITY);
  for (
    let drop = BUDGET_QUALITY_STEP;
    out.length > maxBytes && WEBP_QUALITY - drop >= BUDGET_QUALITY_FLOOR;
    drop += BUDGET_QUALITY_STEP
  ) {
    out = await encodeAtQuality(baseBuf, WEBP_QUALITY - drop, JPEG_QUALITY - drop);
  }
  return out;
}
