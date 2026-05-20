import { ensurePolisSharpConfigured } from "@/lib/polis-sharp-config";
import { posterEncodeFormat } from "@/lib/poster-output-format";
import sharp from "sharp";

export async function encodePosterImage(baseBuf: Buffer): Promise<Buffer> {
  ensurePolisSharpConfigured();
  if (posterEncodeFormat() === "jpeg") {
    return sharp(baseBuf).jpeg({ quality: 88, mozjpeg: true }).toBuffer();
  }
  return sharp(baseBuf).webp({ quality: 86, effort: 4 }).toBuffer();
}
