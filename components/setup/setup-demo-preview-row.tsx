"use client";

import { SETUP_POSTER_THUMB_CLASS } from "@/components/setup/setup-poster-thumb";
import { SetupDemoPosterThumb } from "@/components/setup/setup-demo-poster-thumb";
import { DEMO_TITLES } from "@/lib/demo-catalog";

export function SetupDemoPreviewRow(props: {
  overlayQueryString: string;
  showcaseQueryString: string;
}) {
  return (
    <section className="mb-6">
      <p className="mb-3 text-xs font-medium uppercase tracking-[0.16em] text-zinc-500">
        Sample titles
      </p>
      <div className="flex flex-nowrap gap-3 overflow-x-auto pb-1">
        {DEMO_TITLES.map((demo, index) => (
          <SetupDemoPosterThumb
            alt={demo.title}
            demoId={demo.id}
            frameClassName={SETUP_POSTER_THUMB_CLASS}
            key={demo.id}
            overlayQueryString={props.overlayQueryString}
            priority={index < 3}
            showcaseQueryString={props.showcaseQueryString}
          />
        ))}
      </div>
    </section>
  );
}
