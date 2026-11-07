import { POLIS_RENDERER_REVISION } from "@/lib/polis-renderer";
import { PREVIEW_WIDTH_PARAM, type PreviewThumbWidth } from "@/lib/preview-sizes";

export const PREVIEW_PROVIDERS_PARAM = "p";

export function previewPosterPath(
  imdbId: string,
  overlayQueryString: string,
  providersTag: string,
  width: PreviewThumbWidth | null,
): string {
  const params = new URLSearchParams(overlayQueryString);
  params.set(PREVIEW_PROVIDERS_PARAM, providersTag);
  params.set("polis_r", String(POLIS_RENDERER_REVISION));
  if (width != null) params.set(PREVIEW_WIDTH_PARAM, String(width));
  return `/preview/poster/${imdbId}.webp?${params.toString()}`;
}
