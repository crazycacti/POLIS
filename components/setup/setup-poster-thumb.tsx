"use client";

import { usePreloadedPosterSrc } from "@/components/setup/use-preloaded-poster-src";

export const SETUP_POSTER_THUMB_CLASS =
  "polis-poster-frame w-[min(132px,26vw)] shrink-0 overflow-hidden rounded-lg";

export function SetupPosterThumb(props: {
  alt: string;
  frameClassName?: string;
  priority?: boolean;
  src: string;
  width?: number;
}) {
  const { displaySrc, isLoading } = usePreloadedPosterSrc(props.src);

  return (
    <div className={props.frameClassName ?? SETUP_POSTER_THUMB_CLASS}>
      {displaySrc ? (
        <img
          alt={props.alt}
          className={`h-auto w-full object-cover transition-opacity duration-200 ${isLoading ? "opacity-60" : "opacity-100"}`}
          decoding="async"
          fetchPriority={props.priority ? "high" : "low"}
          height={198}
          loading={props.priority ? "eager" : "lazy"}
          src={displaySrc}
          width={props.width ?? 132}
        />
      ) : (
        <div className="flex aspect-[2/3] items-center justify-center bg-zinc-950 text-[10px] text-zinc-600">
          …
        </div>
      )}
    </div>
  );
}
