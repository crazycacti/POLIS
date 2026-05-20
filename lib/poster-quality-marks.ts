import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

import { prepareAgeMarkTile } from "@/lib/age-rating-marks";
import { wrapSvgWithOverlayFont } from "@/lib/poster-overlay-font";
import { regionBadgeBackground, type RgbaFill } from "@/lib/poster-overlay-colors";

export type QualityMarkId = "4k" | "1080p" | "720p" | "dolby" | "hdr";

export type QualityFlags = {
  has4k: boolean;
  has1080p: boolean;
  has720p: boolean;
  hasDolbyVision: boolean;
  hasDolbyAtmos: boolean;
  hasHdr: boolean;
};

const MARK_DIRS = [
  path.join(process.cwd(), "public", "poster-marks"),
  path.join(process.cwd(), "poster-marks"),
  path.join(process.cwd(), "lib", "poster-marks"),
];

const MARK_GAP_PX = 6;

const markBufferCache = new Map<QualityMarkId, Buffer>();

export function normalizeQualityMarkIds(markIds: QualityMarkId[]): QualityMarkId[] {
  const out: QualityMarkId[] = [];
  let dolby = false;
  for (const id of markIds) {
    const legacy =
      (id as string) === "dolby-vision" || (id as string) === "dolby-av";
    if (id === "dolby" || legacy) {
      if (!dolby) {
        out.push("dolby");
        dolby = true;
      }
      continue;
    }
    out.push(id);
  }
  return out;
}

async function loadMarkAsset(id: QualityMarkId): Promise<Buffer | null> {
  const cached = markBufferCache.get(id);
  if (cached) return cached;

  for (const dir of MARK_DIRS) {
    for (const ext of ["png", "svg"] as const) {
      try {
        const buf = await readFile(path.join(dir, `${id}.${ext}`));
        markBufferCache.set(id, buf);
        return buf;
      } catch {
        continue;
      }
    }
  }
  return null;
}

export function qualityMarkIdsFromFlags(flags: QualityFlags): QualityMarkId[] {
  const marks: QualityMarkId[] = [];

  if (flags.hasDolbyVision || flags.hasDolbyAtmos) {
    marks.push("dolby");
  }

  if (flags.hasHdr) {
    marks.push("hdr");
  }

  if (flags.has4k) {
    marks.push("4k");
  } else if (flags.has1080p) {
    marks.push("1080p");
  } else if (flags.has720p) {
    marks.push("720p");
  }

  return marks;
}

const MARK_FONT_REF = 44;

function markTargetHeight(canvasW: number, id: QualityMarkId, markSize: number): number {
  const scale = markSize / MARK_FONT_REF;
  const base = Math.round(canvasW * 0.078 * scale);
  if (id === "dolby") {
    return clamp(Math.round(base * 0.58), 18, 28);
  }
  if (id === "4k" || id === "1080p" || id === "720p" || id === "hdr") {
    return clamp(base, 28, 52);
  }
  return clamp(Math.round(base * 0.95), 24, 46);
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

const MARK_BADGE_PAD = 5;
const MARK_BADGE_ALPHA = 0.52;

function markBadgeCornerRadius(width: number, height: number): number {
  return Math.min(width, height) / 2;
}

async function flattenMarkOnBadge(buf: Buffer, fill: RgbaFill): Promise<Buffer> {
  const meta = await sharp(buf).metadata();
  const innerW = meta.width ?? 32;
  const innerH = meta.height ?? 24;
  const pad = MARK_BADGE_PAD;
  const w = innerW + pad * 2;
  const h = innerH + pad * 2;
  const rx = markBadgeCornerRadius(w, h);
  const svg = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
  <rect x="0" y="0" width="${w}" height="${h}" rx="${rx}" fill="rgba(${fill.r},${fill.g},${fill.b},${fill.alpha})" />
</svg>`;
  const badgeBg = await sharp(Buffer.from(svg)).png().toBuffer();
  return sharp(badgeBg).composite([{ input: buf, top: pad, left: pad }]).png().toBuffer();
}

type RawMarkTile = { raw: Buffer; w: number; h: number };

async function prepareRawMarkTile(
  id: QualityMarkId,
  canvasW: number,
  rowH: number,
  markSize: number,
): Promise<RawMarkTile | null> {
  const asset = await loadMarkAsset(id);
  if (!asset) return null;

  const rasterInput =
    asset[0] === 0x3c
      ? Buffer.from(wrapSvgWithOverlayFont(asset.toString("utf8")), "utf8")
      : asset;

  const targetH = Math.min(markTargetHeight(canvasW, id, markSize), rowH);
  let buf = await sharp(rasterInput).resize({ height: targetH, fit: "inside" }).png().toBuffer();

  if (id === "dolby") {
    const meta = await sharp(buf).metadata();
    const maxW = Math.round(canvasW * 0.28);
    if ((meta.width ?? 0) > maxW) {
      buf = await sharp(buf).resize({ width: maxW, fit: "inside" }).png().toBuffer();
    }
  }

  try {
    buf = await sharp(buf).trim().toBuffer();
  } catch {}

  const meta = await sharp(buf).metadata();
  const pad = MARK_BADGE_PAD;
  return {
    raw: buf,
    w: (meta.width ?? targetH) + pad * 2,
    h: (meta.height ?? targetH) + pad * 2,
  };
}

export async function compositeTopRightCluster(
  baseBuf: Buffer,
  markIds: QualityMarkId[],
  ageLabel: string | null,
  padX: number,
  padTop: number,
  markSize: number = MARK_FONT_REF,
  horizontalAlign: "left" | "center" | "right" = "right",
): Promise<Buffer> {
  const ids = normalizeQualityMarkIds(markIds);
  if (ids.length === 0 && !ageLabel) return baseBuf;

  const meta = await sharp(baseBuf).metadata();
  const w = meta.width ?? 500;
  const scale = markSize / MARK_FONT_REF;

  const rowH = clamp(Math.round(w * 0.082 * scale), 28, 52);
  const rawTiles: RawMarkTile[] = [];

  for (const id of ids) {
    const tile = await prepareRawMarkTile(id, w, rowH, markSize);
    if (tile) rawTiles.push(tile);
  }

  let ageRaw: RawMarkTile | null = null;
  if (ageLabel?.trim()) {
    const ageTile = await prepareAgeMarkTile(ageLabel.trim(), rowH);
    if (ageTile) {
      const pad = MARK_BADGE_PAD;
      ageRaw = { raw: ageTile.buf, w: ageTile.w + pad * 2, h: ageTile.h + pad * 2 };
    }
  }

  const layoutTiles = ageRaw ? [...rawTiles, ageRaw] : rawTiles;
  if (layoutTiles.length === 0) return baseBuf;

  const totalW =
    layoutTiles.reduce((sum, t) => sum + t.w, 0) + MARK_GAP_PX * Math.max(0, layoutTiles.length - 1);
  let x =
    horizontalAlign === "center"
      ? Math.round((w - totalW) / 2)
      : horizontalAlign === "left"
        ? padX
        : w - padX - totalW;

  const layers: { input: Buffer; top: number; left: number }[] = [];
  for (const tile of layoutTiles) {
    const fill = await regionBadgeBackground(
      baseBuf,
      { left: x, top: padTop, width: tile.w, height: tile.h },
      MARK_BADGE_ALPHA,
    );
    const buf = await flattenMarkOnBadge(tile.raw, fill);
    layers.push({ input: buf, top: padTop, left: x });
    x += tile.w + MARK_GAP_PX;
  }

  return sharp(baseBuf).composite(layers).toBuffer();
}
