import { ensurePolisSharpConfigured } from "@/lib/polis-sharp-config";
import { posterEncodeFormat } from "@/lib/poster-output-format";
import sharp, { type PngOptions, type Sharp } from "sharp";

const WEBP_QUALITY = 80;
const WEBP_EFFORT = 5;
const JPEG_QUALITY = 88;
const BUDGET_QUALITY_STEP = 10;
const BUDGET_QUALITY_FLOOR = 50;

export const INTERMEDIATE_PNG: PngOptions = { compressionLevel: 0 };

export type PosterEncodeInput = Buffer | Sharp;

function pipelineOf(input: PosterEncodeInput): Sharp {
  return Buffer.isBuffer(input) ? sharp(input) : input;
}

async function encodeAtQuality(pipeline: Sharp, webpQuality: number, jpegQuality: number): Promise<Buffer> {
  if (posterEncodeFormat() === "jpeg") {
    return pipeline.jpeg({ quality: jpegQuality, mozjpeg: true }).toBuffer();
  }
  return pipeline.webp({ quality: webpQuality, effort: WEBP_EFFORT }).toBuffer();
}

export async function encodePosterImage(input: PosterEncodeInput): Promise<Buffer> {
  ensurePolisSharpConfigured();
  return encodeAtQuality(pipelineOf(input), WEBP_QUALITY, JPEG_QUALITY);
}

export async function encodePosterImageWithinBudget(input: PosterEncodeInput, maxBytes: number): Promise<Buffer> {
  ensurePolisSharpConfigured();
  const { data, info } = await pipelineOf(input).raw().toBuffer({ resolveWithObject: true });
  const rawPipeline = () => sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } });
  let out = await encodeAtQuality(rawPipeline(), WEBP_QUALITY, JPEG_QUALITY);
  for (
    let drop = BUDGET_QUALITY_STEP;
    out.length > maxBytes && WEBP_QUALITY - drop >= BUDGET_QUALITY_FLOOR;
    drop += BUDGET_QUALITY_STEP
  ) {
    out = await encodeAtQuality(rawPipeline(), WEBP_QUALITY - drop, JPEG_QUALITY - drop);
  }
  return out;
}
