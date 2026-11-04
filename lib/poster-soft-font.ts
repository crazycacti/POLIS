import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import * as opentype from "opentype.js";

import { getOverlayFont } from "@/lib/overlay-font-metrics";

export type SoftFontWeight = 600 | 700;

export type SoftTextPath = {
  d: string;
  width: number;
  ascent: number;
};

const INTER_SUBSETS = ["latin", "latin-ext", "greek", "cyrillic"] as const;

const INTER_FONT_DIRS = [
  path.join(process.cwd(), "assets", "fonts", "inter"),
  path.join(process.cwd(), "node_modules", "@fontsource", "inter", "files"),
];

const fontCache = new Map<SoftFontWeight, opentype.Font[]>();

function loadInterSubsets(weight: SoftFontWeight): opentype.Font[] {
  const cached = fontCache.get(weight);
  if (cached) return cached;

  const fonts: opentype.Font[] = [];
  for (const subset of INTER_SUBSETS) {
    const fileName = `inter-${subset}-${weight}-normal.woff`;
    for (const dir of INTER_FONT_DIRS) {
      const file = path.join(/*turbopackIgnore: true*/ dir, fileName);
      if (!existsSync(file)) continue;
      try {
        const bytes = readFileSync(file);
        fonts.push(opentype.parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)));
        break;
      } catch (error) {
        console.warn(`[polis] could not parse ${fileName}`, error);
      }
    }
  }
  fontCache.set(weight, fonts);
  return fonts;
}

// Inter ships as per-script subsets; DejaVu covers characters they lack.
function glyphFor(ch: string, weight: SoftFontWeight): { font: opentype.Font; glyph: opentype.Glyph } | null {
  for (const font of loadInterSubsets(weight)) {
    const glyph = font.charToGlyph(ch);
    if (glyph.index !== 0) return { font, glyph };
  }
  const fallback = getOverlayFont(700);
  if (!fallback) return null;
  return { font: fallback, glyph: fallback.charToGlyph(ch) };
}

const INTER_CAP_HEIGHT_EM = 0.727;

export function softCapHeight(fontSize: number, weight: SoftFontWeight): number {
  const font = loadInterSubsets(weight)[0];
  const capHeight = font?.tables.os2?.sCapHeight;
  if (font && typeof capHeight === "number" && capHeight > 0) {
    return (capHeight / font.unitsPerEm) * fontSize;
  }
  return INTER_CAP_HEIGHT_EM * fontSize;
}

export function softFontAvailable(): boolean {
  return loadInterSubsets(600).length > 0 && loadInterSubsets(700).length > 0;
}

export function measureSoftText(text: string, fontSize: number, weight: SoftFontWeight): number {
  let width = 0;
  for (const ch of text) {
    const hit = glyphFor(ch, weight);
    if (!hit) continue;
    width += ((hit.glyph.advanceWidth ?? 0) * fontSize) / hit.font.unitsPerEm;
  }
  return width;
}

export function fitSoftText(text: string, fontSize: number, weight: SoftFontWeight, maxWidth: number): string {
  if (measureSoftText(text, fontSize, weight) <= maxWidth) return text;
  const chars = [...text];
  while (chars.length > 1) {
    chars.pop();
    const candidate = `${chars.join("").trimEnd()}…`;
    if (measureSoftText(candidate, fontSize, weight) <= maxWidth) return candidate;
  }
  return "";
}

export function softTextPath(
  text: string,
  x: number,
  baseline: number,
  fontSize: number,
  weight: SoftFontWeight,
): SoftTextPath | null {
  const parts: string[] = [];
  let cursor = x;
  let ascent = 0;
  for (const ch of text) {
    const hit = glyphFor(ch, weight);
    if (!hit) continue;
    const scale = fontSize / hit.font.unitsPerEm;
    parts.push(hit.glyph.getPath(cursor, baseline, fontSize).toPathData(2));
    ascent = Math.max(ascent, hit.font.ascender * scale);
    cursor += (hit.glyph.advanceWidth ?? 0) * scale;
  }
  if (parts.length === 0) return null;
  return { d: parts.join(" "), width: cursor - x, ascent };
}
