import { NextRequest } from "next/server";

import { isValidPolisConfigId } from "@/lib/polis-config-id";
import { polisDiskCacheEnabled } from "@/lib/polis-disk-cache";
import { normalizePublicBase } from "@/lib/polis-urls";
import { handlePosterDefaultRequest } from "@/lib/poster-route-handler";
import { mapWithConcurrency, type StremioCatalogMeta } from "@/lib/stremio-catalog-fetch";

const PREWARM_POSTER_COUNT = 12;
const PREWARM_CONCURRENCY = 4;
const POSTER_PATH_RE = /^\/(?:([^/]+)\/)?poster\/imdb\/poster-default\/(tt\d+)\.jpg$/;

type PrewarmTarget = { url: string; imdbId: string; configId: string | null };

export function posterPrewarmTarget(posterUrl: string, publicBase: string): PrewarmTarget | null {
  const base = normalizePublicBase(publicBase);
  if (!posterUrl.startsWith(`${base}/`)) return null;

  let pathname: string;
  try {
    pathname = new URL(posterUrl.slice(base.length), "http://polis.invalid").pathname;
  } catch {
    return null;
  }

  const match = POSTER_PATH_RE.exec(pathname);
  if (!match) return null;
  const configId = match[1] ?? null;
  if (configId && !isValidPolisConfigId(configId)) return null;
  return { url: posterUrl, imdbId: match[2]!, configId };
}

export function prewarmCatalogPosters(metas: StremioCatalogMeta[], publicBase: string): void {
  if (!polisDiskCacheEnabled()) return;

  const targets = metas
    .slice(0, PREWARM_POSTER_COUNT)
    .map((meta) => (meta.poster ? posterPrewarmTarget(meta.poster, publicBase) : null))
    .filter((target): target is PrewarmTarget => target != null);
  if (!targets.length) return;

  void mapWithConcurrency(targets, PREWARM_CONCURRENCY, async (target) => {
    try {
      const response = await handlePosterDefaultRequest(
        new NextRequest(target.url),
        target.imdbId,
        target.configId,
      );
      await response.body?.cancel();
      return response.ok;
    } catch {
      return false;
    }
  }).then(
    (results) => {
      const failed = results.filter((ok) => !ok).length;
      if (failed) console.warn(`[polis] poster prewarm failed for ${failed} of ${results.length} titles`);
    },
    (error) => console.warn("[polis] poster prewarm failed", error),
  );
}
