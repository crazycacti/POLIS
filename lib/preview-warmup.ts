import { pickDefaultArtworkMovieSource, pickDefaultArtworkSource } from "@/lib/artwork-defaults";
import { polisDiskCacheEnabled } from "@/lib/polis-disk-cache";
import { applyStarterLook, STARTER_LOOKS } from "@/lib/poster-looks";
import { configureInitialPosterOverlay, type PosterOverlayQuery } from "@/lib/poster-query";
import { PREVIEW_THUMB_WIDTHS, type PreviewThumbWidth } from "@/lib/preview-image-cache";
import { previewProvidersTag, type PreviewCallerKeys } from "@/lib/preview-keys";
import { previewPoster, previewPosterCached, resolvePreviewAuth, type PreviewAuth } from "@/lib/preview-poster";
import type { PreviewTitle } from "@/lib/preview-title-list";
import { runAsBackgroundUpstreamWork } from "@/lib/upstream-priority";

const WARMUP_REPEAT_MS = 10 * 60 * 1000;
const WARMUP_WIDTHS: (PreviewThumbWidth | null)[] = [null, ...PREVIEW_THUMB_WIDTHS];

let running: Promise<void> | null = null;
const lastRunByProviders = new Map<string, number>();

export function previewWarmupOverlays(auth: PreviewAuth): PosterOverlayQuery[] {
  const keys = { hasTmdb: auth.providers.tmdb, hasFanart: auth.providers.fanart, hasTvdb: auth.providers.tvdb };
  const base = configureInitialPosterOverlay({
    artwork: pickDefaultArtworkSource(keys),
    artworkMovie: pickDefaultArtworkMovieSource(keys),
    artworkFallback: "metahub",
  });
  return STARTER_LOOKS.map((look) => applyStarterLook(base, look));
}

type WarmJob = { imdbId: string; overlay: PosterOverlayQuery; width: PreviewThumbWidth | null };

async function runWarmup(jobs: WarmJob[], auth: PreviewAuth, language: string): Promise<void> {
  let rendered = 0;
  for (const job of jobs) {
    const request = { ...job, auth, language };
    if (await previewPosterCached(request)) continue;
    const result = await runAsBackgroundUpstreamWork(() => previewPoster({ ...request, countAgainstBudget: false }));
    if (result.kind !== "image" || result.degraded) {
      console.warn(`[polis] preview warm-up stopped at ${job.imdbId} (${result.kind === "image" ? "degraded" : result.kind})`);
      return;
    }
    rendered += 1;
  }
  if (rendered > 0) console.info(`[polis] preview warm-up rendered ${rendered} images`);
}

export function previewWarmupIdle(): Promise<void> {
  return running ?? Promise.resolve();
}

export function warmPreviewPosters(
  titles: PreviewTitle[],
  caller: PreviewCallerKeys,
  now = Date.now(),
): Promise<void> | null {
  if (!polisDiskCacheEnabled() || running || titles.length === 0) return null;
  const auth = resolvePreviewAuth(caller);
  if (!auth.credential) return null;
  const tag = previewProvidersTag(auth.providers);
  const lastRun = lastRunByProviders.get(tag);
  if (lastRun != null && now - lastRun < WARMUP_REPEAT_MS) return null;
  lastRunByProviders.set(tag, now);

  const language = process.env.TMDB_LANGUAGE?.trim() || "en-US";
  const jobs = previewWarmupOverlays(auth).flatMap((overlay) =>
    titles.flatMap((title) => WARMUP_WIDTHS.map((width) => ({ imdbId: title.imdbId, overlay, width }))),
  );
  const run = new Promise<void>((resolve) => setImmediate(resolve))
    .then(() => runWarmup(jobs, auth, language))
    .catch((error: unknown) => console.warn("[polis] preview warm-up failed", error))
    .finally(() => {
      running = null;
    });
  running = run;
  return run;
}
