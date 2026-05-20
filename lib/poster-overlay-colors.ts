import sharp from "sharp";

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

type Region = { left: number; top: number; width: number; height: number };

async function meanRgbFromRegion(
  baseBuf: Buffer,
  rect: Region,
): Promise<{ r: number; g: number; b: number }> {
  const meta = await sharp(baseBuf).metadata();
  const iw = meta.width ?? 500;
  const ih = meta.height ?? 750;

  const left = clamp(Math.floor(rect.left), 0, iw - 2);
  const top = clamp(Math.floor(rect.top), 0, ih - 2);
  const width = clamp(Math.floor(rect.width), 1, iw - left);
  const height = clamp(Math.floor(rect.height), 1, ih - top);

  const { data, info } = await sharp(baseBuf)
    .extract({ left, top, width, height })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const ch = info.channels;
  const px = data.length / ch;
  if (px === 0) return { r: 24, g: 24, b: 27 };

  let r = 0;
  let g = 0;
  let b = 0;
  for (let i = 0; i < data.length; i += ch) {
    r += data[i];
    g += data[i + 1];
    b += data[i + 2];
  }
  return { r: r / px, g: g / px, b: b / px };
}

export async function contrastTextColorFromRegion(
  baseBuf: Buffer,
  rect: Region,
): Promise<string> {
  const { r, g, b } = await meanRgbFromRegion(baseBuf, rect);
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  return lum > 132 ? "#0c0c0c" : "#f5f5f5";
}

export async function trendPillFillsFromRegion(
  baseBuf: Buffer,
  rect: Region,
  backgroundAlpha = 0.9,
): Promise<{ bg: string; text: string }> {
  const { r, g, b } = await meanRgbFromRegion(baseBuf, rect);
  const text = await contrastTextColorFromRegion(baseBuf, rect);
  const alpha = Math.min(1, Math.max(0, backgroundAlpha));
  return {
    bg: `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${alpha})`,
    text,
  };
}

export type RgbaFill = { r: number; g: number; b: number; alpha: number };

export async function regionBadgeBackground(
  baseBuf: Buffer,
  rect: Region,
  backgroundAlpha = 0.6,
): Promise<RgbaFill> {
  const { r, g, b } = await meanRgbFromRegion(baseBuf, rect);
  const alpha = Math.min(1, Math.max(0, backgroundAlpha));
  return { r: Math.round(r), g: Math.round(g), b: Math.round(b), alpha };
}
