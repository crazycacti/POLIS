import sharp from "sharp";

import { svgFontFamilyAttr, svgOverlayFontDefs } from "@/lib/poster-overlay-font";
import { escapeXml } from "@/lib/xml-escape";

export async function prepareAgeMarkTile(
  label: string,
  rowH: number,
): Promise<{ buf: Buffer; w: number; h: number }> {
  const fs = Math.min(Math.round(rowH * 0.52), 22);
  const text = label.trim().slice(0, 10);
  const boxW = Math.ceil(text.length * fs * 0.56) + 4;
  const boxH = fs + 6;

  const svg = `<svg width="${boxW}" height="${boxH}" xmlns="http://www.w3.org/2000/svg">
  ${svgOverlayFontDefs()}
  <text x="${boxW / 2}" y="${boxH - 4}" font-size="${fs}" ${svgFontFamilyAttr()} font-weight="800" fill="#ffffff" text-anchor="middle">${escapeXml(text)}</text>
</svg>`;

  let buf = await sharp(Buffer.from(svg)).png().toBuffer();
  try {
    buf = await sharp(buf).trim().toBuffer();
  } catch {}
  const meta = await sharp(buf).metadata();
  return { buf, w: meta.width ?? boxW, h: meta.height ?? boxH };
}
