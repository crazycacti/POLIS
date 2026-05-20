import { ensurePolisSharpConfigured } from "@/lib/polis-sharp-config";
import {
  footerPillNominalBoxHeight,
  type FooterPillMetrics,
} from "@/lib/poster-footer-pill";
import type { GridCell } from "@/lib/poster-query";
import { renderLogoPng } from "@/lib/render-logo-default";
import sharp from "sharp";

export const LOGO_ABOVE_FOOTER_GAP_PX = 10;
export const LOGO_ABOVE_FOOTER_GAP_MAX_PX = 14;

export function posterLogoAboveFooterGap(canvasH: number): number {
  const scaled = Math.round(canvasH * 0.012);
  return Math.min(
    LOGO_ABOVE_FOOTER_GAP_MAX_PX,
    Math.max(LOGO_ABOVE_FOOTER_GAP_PX, scaled),
  );
}

export function posterLogoMaxWidth(canvasWidth: number): number {
  return Math.min(800, Math.round(canvasWidth * 0.84));
}

export type PosterLogoPlacement = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export function posterFooterBandTop(
  canvasH: number,
  padBottom: number,
  footerMaxBoxH: number,
): number {
  return canvasH - padBottom - footerMaxBoxH;
}

export function resolvePosterLogoFooterBandTop(params: {
  canvasH: number;
  footerPadBottom: number;
  genreEnabled: boolean;
  ratingEnabled: boolean;
  genreMetrics: FooterPillMetrics | null;
  ratingMetrics: FooterPillMetrics | null;
  genreFooterFs: number;
  ratingFooterFs: number;
}): number | null {
  if (!params.genreEnabled && !params.ratingEnabled) return null;

  let footerMaxBoxH = Math.max(
    params.genreMetrics?.boxH ?? 0,
    params.ratingMetrics?.boxH ?? 0,
  );

  if (footerMaxBoxH <= 0) {
    const nominalHeights: number[] = [];
    if (params.genreEnabled) {
      nominalHeights.push(footerPillNominalBoxHeight(params.genreFooterFs));
    }
    if (params.ratingEnabled) {
      nominalHeights.push(footerPillNominalBoxHeight(params.ratingFooterFs));
    }
    footerMaxBoxH = Math.max(...nominalHeights, 0);
  }

  if (footerMaxBoxH <= 0) return null;
  return posterFooterBandTop(params.canvasH, params.footerPadBottom, footerMaxBoxH);
}

export function computePosterLogoPlacement(params: {
  canvasW: number;
  canvasH: number;
  logoW: number;
  logoH: number;
  footerBandTop: number | null;
  padBottom: number;
  padX: number;
  gap: number;
  gridCell: GridCell;
}): PosterLogoPlacement {
  const maxW = posterLogoMaxWidth(params.canvasW);
  const scale = Math.min(1, maxW / params.logoW);
  const width = Math.max(1, Math.round(params.logoW * scale));
  const height = Math.max(1, Math.round(params.logoH * scale));

  let left: number;
  let top: number;
  if (params.footerBandTop != null) {
    left = Math.round((params.canvasW - width) / 2);
    top = Math.max(0, params.footerBandTop - params.gap - height);
  } else {
    const row = Math.floor(params.gridCell / 3);
    const col = params.gridCell % 3;
    if (col === 0) left = params.padX;
    else if (col === 2) left = Math.max(0, params.canvasW - params.padX - width);
    else left = Math.round((params.canvasW - width) / 2);

    if (row === 0) top = params.padBottom;
    else if (row === 1) top = Math.max(0, Math.round((params.canvasH - height) / 2));
    else top = Math.max(0, params.canvasH - params.padBottom - height);
  }

  return { left, top, width, height };
}

async function trimLogoTransparentPadding(buf: Buffer): Promise<Buffer> {
  try {
    const trimmed = await sharp(buf).trim().png().toBuffer();
    const meta = await sharp(trimmed).metadata();
    if ((meta.width ?? 0) > 0 && (meta.height ?? 0) > 0) {
      return trimmed;
    }
  } catch {}
  return buf;
}

export async function preparePosterLogoRaster(
  logoPath: string,
  maxWidth: number,
): Promise<{ buffer: Buffer; width: number; height: number } | null> {
  ensurePolisSharpConfigured();
  const raw = await renderLogoPng(logoPath);
  if (!raw) return null;

  const trimmed = await trimLogoTransparentPadding(raw);
  const meta = await sharp(trimmed).metadata();
  const logoW = meta.width ?? 1;
  const logoH = meta.height ?? 1;

  if (logoW <= maxWidth) {
    return { buffer: trimmed, width: logoW, height: logoH };
  }

  const buffer = await sharp(trimmed)
    .resize({
      width: maxWidth,
      fit: "inside",
      withoutEnlargement: true,
    })
    .png()
    .toBuffer();
  const outMeta = await sharp(buffer).metadata();
  return {
    buffer,
    width: outMeta.width ?? maxWidth,
    height: outMeta.height ?? 1,
  };
}

export async function applyTitleLogoToPosterBuffer(params: {
  baseBuf: Buffer;
  logoPath: string;
  canvasW: number;
  canvasH: number;
  footerBandTop: number | null;
  padBottom: number;
  padX: number;
  gap: number;
  gridCell: GridCell;
}): Promise<Buffer> {
  const maxW = posterLogoMaxWidth(params.canvasW);
  const raster = await preparePosterLogoRaster(params.logoPath, maxW);
  if (!raster) return params.baseBuf;

  const placement = computePosterLogoPlacement({
    canvasW: params.canvasW,
    canvasH: params.canvasH,
    logoW: raster.width,
    logoH: raster.height,
    footerBandTop: params.footerBandTop,
    padBottom: params.padBottom,
    padX: params.padX,
    gap: params.gap,
    gridCell: params.gridCell,
  });

  const scaled =
    raster.width === placement.width && raster.height === placement.height
      ? raster.buffer
      : await sharp(raster.buffer)
          .resize({
            width: placement.width,
            height: placement.height,
            fit: "fill",
          })
          .png()
          .toBuffer();

  return sharp(params.baseBuf)
    .composite([{ input: scaled, left: placement.left, top: placement.top }])
    .toBuffer();
}
