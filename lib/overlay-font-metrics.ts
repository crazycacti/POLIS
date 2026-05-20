import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import * as opentype from "opentype.js";

export type OverlayFontWeight = 600 | 700;

export type MeasuredOverlayText = {
  width: number;
  lineHeight: number;
  ascender: number;
  descender: number;
};

export type TrendPillGlyphLayout = {
  text: string;
  fontSize: number;
  padX: number;
  padY: number;
  boxW: number;
  boxH: number;
  textPath: string;
  textOffsetX: number;
  textOffsetY: number;
};

const REGULAR_FONT_PATHS = [
  path.join(process.cwd(), "assets/fonts/DejaVuSans.ttf"),
  "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
  "/usr/share/fonts/TTF/DejaVuSans.ttf",
];

const BOLD_FONT_PATHS = [
  path.join(process.cwd(), "assets/fonts/DejaVuSans-Bold.ttf"),
  "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
  "/usr/share/fonts/TTF/DejaVuSans-Bold.ttf",
];

const fontCache = new Map<OverlayFontWeight, opentype.Font | null>();

function loadFontFromPaths(paths: string[]): opentype.Font | null {
  for (const fontPath of paths) {
    if (!existsSync(fontPath)) continue;
    try {
      return opentype.parse(readFileSync(fontPath));
    } catch {
      continue;
    }
  }
  return null;
}

export function getOverlayFont(weight: OverlayFontWeight): opentype.Font | null {
  const cached = fontCache.get(weight);
  if (cached !== undefined) return cached;

  const font =
    weight === 700
      ? loadFontFromPaths(BOLD_FONT_PATHS) ?? loadFontFromPaths(REGULAR_FONT_PATHS)
      : loadFontFromPaths(REGULAR_FONT_PATHS);

  fontCache.set(weight, font);
  if (weight === 700 && font && !fontCache.has(600)) {
    fontCache.set(600, loadFontFromPaths(REGULAR_FONT_PATHS));
  }
  return font;
}

function glyphAdvanceWidth(font: opentype.Font, text: string, fontSize: number): number {
  const scale = fontSize / font.unitsPerEm;
  let width = 0;
  for (const ch of text) {
    const glyph = font.charToGlyph(ch);
    width += (glyph.advanceWidth ?? 0) * scale;
  }
  return width;
}

export function measureOverlayText(
  text: string,
  fontSize: number,
  weight: OverlayFontWeight = 700,
): MeasuredOverlayText | null {
  const font = getOverlayFont(weight);
  if (!font) return null;

  const scale = fontSize / font.unitsPerEm;
  return {
    width: glyphAdvanceWidth(font, text, fontSize),
    lineHeight: (font.ascender - font.descender) * scale,
    ascender: font.ascender * scale,
    descender: font.descender * scale,
  };
}

export function buildTrendPillGlyphLayout(
  text: string,
  fontSize: number,
  padX: number,
  padY: number,
): TrendPillGlyphLayout | null {
  const font = getOverlayFont(700);
  if (!font) return null;

  const scale = fontSize / font.unitsPerEm;
  const baseline = 0;
  let cursor = 0;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const pathParts: string[] = [];

  for (const ch of text) {
    const glyph = font.charToGlyph(ch);
    const glyphPath = glyph.getPath(cursor, baseline, fontSize);
    pathParts.push(glyphPath.toPathData(2));
    const bbox = glyphPath.getBoundingBox();
    minX = Math.min(minX, bbox.x1);
    minY = Math.min(minY, bbox.y1);
    maxX = Math.max(maxX, bbox.x2);
    maxY = Math.max(maxY, bbox.y2);
    cursor += (glyph.advanceWidth ?? 0) * scale;
  }

  if (!Number.isFinite(minX)) return null;

  const textW = maxX - minX;
  const textH = maxY - minY;
  const boxW = Math.round(textW + padX * 2);
  const boxH = Math.round(textH + padY * 2);

  return {
    text,
    fontSize,
    padX,
    padY,
    boxW,
    boxH,
    textPath: pathParts.join(" "),
    textOffsetX: padX - minX,
    textOffsetY: padY - minY,
  };
}
