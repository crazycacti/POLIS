import { DEMO_TITLES } from "@/lib/demo-catalog";
import { overlayQueryStringFromRaw } from "@/lib/demo-poster-query";
import { staticDemoPosterSrc } from "@/lib/demo-poster-static";
import { POLIS_RENDERER_REVISION } from "@/lib/polis-renderer";
import { showcasePosterQueryString } from "@/lib/poster-query";
import { PREVIEW_WIDTH_PARAM, type PreviewThumbWidth } from "@/lib/preview-sizes";

export function dynamicDemoPosterPath(demoId: string, queryString: string): string {
  return `/demo/poster/${demoId}.jpg?${queryString}&polis_r=${POLIS_RENDERER_REVISION}`;
}

export function demoPosterThumbPath(demoId: string, queryString: string, width: PreviewThumbWidth): string {
  return `${dynamicDemoPosterPath(demoId, queryString)}&${PREVIEW_WIDTH_PARAM}=${width}`;
}

export function resolveSetupDemoPosterSrc(
  demoId: string,
  overlayQueryString: string,
  showcaseQueryString: string,
): string {
  const normalized = overlayQueryStringFromRaw(overlayQueryString);
  const showcase = overlayQueryStringFromRaw(showcaseQueryString);
  if (normalized === showcase) {
    return staticDemoPosterSrc(demoId);
  }
  return dynamicDemoPosterPath(demoId, overlayQueryString);
}
