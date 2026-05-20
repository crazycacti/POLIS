"use client";

import { usePreloadedPosterSrc } from "@/components/setup/use-preloaded-poster-src";

export function SetupPreviewSidebar(props: {
  imdbPreview: string;
  onImdbChange: (value: string) => void;
  idOk: boolean;
  livePreviewSrc: string | null;
  liveError: string | null;
  hasPreviewCredential: boolean;
}) {
  const { displaySrc, isLoading, loadFailed } = usePreloadedPosterSrc(props.livePreviewSrc);
  const waitingForPreview =
    Boolean(props.livePreviewSrc) && !displaySrc && !loadFailed && isLoading;
  const showPoster = Boolean(displaySrc) && !loadFailed;

  const liveMessage =
    props.liveError ??
    (loadFailed ? "Poster preview failed. Check API keys and IMDb id." : null) ??
    (waitingForPreview ? "Loading preview…" : null) ??
    (props.hasPreviewCredential && !props.idOk && props.imdbPreview.length > 0
      ? "Invalid IMDb id"
      : props.hasPreviewCredential
        ? null
        : "Add TMDB key on API keys tab");

  return (
    <aside className="w-full shrink-0 lg:sticky lg:top-4 lg:z-10 lg:w-[min(220px,28vw)]">
      <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/90 p-4 backdrop-blur-sm">
        <p className="mb-4 text-xs font-medium uppercase tracking-[0.16em] text-zinc-500">
          Live preview
        </p>

        <label className="mb-2 flex flex-col gap-1">
          <span className="text-xs text-zinc-500">IMDb id</span>
          <input
            className="polis-input font-mono text-xs"
            onChange={(e) => props.onImdbChange(e.target.value.trim())}
            placeholder="tt12042730"
            spellCheck={false}
            value={props.imdbPreview}
          />
          {!props.idOk && props.imdbPreview.length > 0 ? (
            <span className="text-[10px] text-red-400/90">Use tt1234567 format.</span>
          ) : null}
        </label>

        <div className="polis-poster-frame relative overflow-hidden rounded-lg">
          {showPoster ? (
            <>
              <img
                alt="Live poster preview"
                className={`h-auto w-full object-cover transition-opacity duration-200 ${isLoading ? "opacity-50" : "opacity-100"}`}
                decoding="async"
                height={330}
                loading="eager"
                src={displaySrc!}
                width={220}
              />
              {isLoading ? (
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/30 text-[10px] uppercase tracking-wider text-zinc-400"
                >
                  Updating
                </div>
              ) : null}
            </>
          ) : (
            <div className="flex aspect-[2/3] items-center justify-center bg-zinc-950 px-3 text-center text-[11px] leading-snug text-zinc-600">
              {liveMessage ?? "Enter a valid IMDb id"}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
