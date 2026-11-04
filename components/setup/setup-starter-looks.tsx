"use client";

import { DEMO_TITLES } from "@/lib/demo-catalog";
import { dynamicDemoPosterPath } from "@/lib/demo-poster-urls";
import {
  applyStarterLook,
  matchesStarterLook,
  STARTER_LOOKS,
} from "@/lib/poster-looks";
import type { PosterOverlayQuery } from "@/lib/poster-query";
import { serializePosterQuery } from "@/lib/poster-query";

const LOOK_PREVIEW_DEMO_ID = DEMO_TITLES[0]!.id;

export function SetupStarterLooks(props: {
  overlay: PosterOverlayQuery;
  onChange: (overlay: PosterOverlayQuery) => void;
}) {
  return (
    <div className="mb-5 border-b border-white/5 pb-5">
      <p className="mb-3 text-xs text-zinc-500" id="starter-looks-label">
        Start from
      </p>
      <div aria-labelledby="starter-looks-label" className="grid grid-cols-2 gap-3 sm:grid-cols-4" role="group">
        {STARTER_LOOKS.map((look) => {
          const selected = matchesStarterLook(props.overlay, look);
          const preview = applyStarterLook(props.overlay, look);
          return (
            <button
              aria-pressed={selected}
              className={`group flex flex-col gap-2 rounded-lg p-1.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/60 ${
                selected ? "bg-cyan-500/15" : "hover:bg-white/5"
              }`}
              key={look.id}
              onClick={() => props.onChange(applyStarterLook(props.overlay, look))}
              type="button"
            >
              <img
                alt=""
                className={`aspect-2/3 w-full rounded-md object-cover ${selected ? "ring-2 ring-cyan-400/70" : ""}`}
                decoding="async"
                height={198}
                loading="lazy"
                src={dynamicDemoPosterPath(LOOK_PREVIEW_DEMO_ID, serializePosterQuery(preview))}
                width={132}
              />
              <span className={`px-0.5 text-sm ${selected ? "text-white" : "text-zinc-400"}`}>
                {look.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
