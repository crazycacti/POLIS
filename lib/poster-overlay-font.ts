import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export const POLIS_OVERLAY_FONT_ID = "Polis Overlay";

export const POLIS_OVERLAY_FONT_FAMILY = `"${POLIS_OVERLAY_FONT_ID}", DejaVu Sans, Liberation Sans, sans-serif`;

const REGULAR_FONT_PATHS = [
  path.join(process.cwd(), "assets", "fonts", "DejaVuSans.ttf"),
  "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
  "/usr/share/fonts/TTF/DejaVuSans.ttf",
];

const BOLD_FONT_PATHS = [
  path.join(process.cwd(), "assets", "fonts", "DejaVuSans-Bold.ttf"),
  "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
  "/usr/share/fonts/TTF/DejaVuSans-Bold.ttf",
];

let embeddedFontFaceCss: string | null | undefined;

function fontFaceCss(fontPath: string, weightRange: string): string | null {
  try {
    const base64 = readFileSync(fontPath).toString("base64");
    return `@font-face{font-family:"${POLIS_OVERLAY_FONT_ID}";src:url("data:font/ttf;base64,${base64}") format("truetype");font-weight:${weightRange};font-style:normal;}`;
  } catch {
    return null;
  }
}

function loadEmbeddedFontFaceCss(): string | null {
  if (embeddedFontFaceCss !== undefined) return embeddedFontFaceCss;

  const faces: string[] = [];
  for (const fontPath of REGULAR_FONT_PATHS) {
    if (!existsSync(fontPath)) continue;
    const face = fontFaceCss(fontPath, "400 600");
    if (face) faces.push(face);
    break;
  }

  for (const fontPath of BOLD_FONT_PATHS) {
    if (!existsSync(fontPath)) continue;
    const face = fontFaceCss(fontPath, "700");
    if (face) faces.push(face);
    break;
  }

  embeddedFontFaceCss = faces.length > 0 ? faces.join("") : null;
  return embeddedFontFaceCss;
}

export function svgFontFamilyAttr(): string {
  return `font-family='${POLIS_OVERLAY_FONT_FAMILY}'`;
}

export function svgOverlayFontDefs(): string {
  const face = loadEmbeddedFontFaceCss();
  if (!face) return "";
  return `<defs><style type="text/css"><![CDATA[${face}]]></style></defs>`;
}

export function wrapSvgWithOverlayFont(svg: string): string {
  const trimmed = svg.trim();
  if (!trimmed.includes("<svg")) return svg;
  if (trimmed.includes("@font-face") || trimmed.includes(POLIS_OVERLAY_FONT_ID)) {
    return svg;
  }
  const defs = svgOverlayFontDefs();
  if (!defs) return svg;
  return trimmed.replace(/<svg\b([^>]*)>/i, `<svg$1>${defs}`);
}
