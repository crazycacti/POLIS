"use client";

import { useMemo } from "react";

import { SETUP_POSTER_THUMB_CLASS } from "@/components/setup/setup-poster-thumb";
import { resolveSetupDemoPosterSrc } from "@/lib/demo-poster-urls";

export function SetupDemoPosterThumb(props: {
  alt: string;
  demoId: string;
  frameClassName?: string;
  overlayQueryString: string;
  priority?: boolean;
  showcaseQueryString: string;
  width?: number;
}) {
  const src = useMemo(
    () =>
      resolveSetupDemoPosterSrc(
        props.demoId,
        props.overlayQueryString,
        props.showcaseQueryString,
      ),
    [props.demoId, props.overlayQueryString, props.showcaseQueryString],
  );

  return (
    <div className={props.frameClassName ?? SETUP_POSTER_THUMB_CLASS}>
      <img
        alt={props.alt}
        className="h-auto w-full object-cover"
        decoding="async"
        fetchPriority={props.priority ? "high" : "low"}
        height={198}
        loading={props.priority ? "eager" : "lazy"}
        src={src}
        width={props.width ?? 132}
      />
    </div>
  );
}
