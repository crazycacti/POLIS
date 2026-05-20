import { DEMO_TITLES } from "@/lib/demo-catalog";
import { posterDiskExtension } from "@/lib/poster-output-format";
import { POLIS_RENDERER_REVISION } from "@/lib/polis-renderer";
import { showcasePosterQueryString } from "@/lib/poster-query";

export function staticDemoPosterSrc(demoId: string): string {
  const ext = posterDiskExtension();
  return `/demo-posters/${demoId}${ext}?r=${POLIS_RENDERER_REVISION}`;
}

export function listStaticDemoPosterPreloadPaths(): string[] {
  return DEMO_TITLES.map((d) => staticDemoPosterSrc(d.id));
}

export function showcaseDemoPosterQueryString(): string {
  return showcasePosterQueryString();
}

export function isShowcaseDemoPosterQuery(queryString: string): boolean {
  return queryString === showcasePosterQueryString();
}
