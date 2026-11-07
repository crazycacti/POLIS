"use client";

import { useState } from "react";

import {
  ClientPreview,
  ClientPreviewTabs,
  type ClientPreviewView,
} from "@/components/setup/setup-client-previews";
import { usePreloadedPosterSrc } from "@/components/setup/use-preloaded-poster-src";
import { DEMO_TITLES } from "@/lib/demo-catalog";
import { resolveSetupDemoPosterSrc } from "@/lib/demo-poster-urls";

const CUSTOM_TITLE = "custom";

export function SetupPreviewSidebar(props: {
  imdbPreview: string;
  onImdbChange: (value: string) => void;
  idOk: boolean;
  livePreviewSrc: string | null;
  liveError: string | null;
  hasPreviewCredential: boolean;
  overlayQueryString: string;
  showcaseQueryString: string;
  landscape: boolean;
}) {
  const [selected, setSelected] = useState<string>(DEMO_TITLES[0]!.id);
  const [view, setView] = useState<ClientPreviewView>("poster");

  const demoSrc = (demoId: string) =>
    resolveSetupDemoPosterSrc(demoId, props.overlayQueryString, props.showcaseQueryString);
  const usingCustom = selected === CUSTOM_TITLE;
  const targetSrc = usingCustom ? props.livePreviewSrc : demoSrc(selected);
  const { displaySrc, isLoading, loadFailed } = usePreloadedPosterSrc(targetSrc);
  const waitingForPreview = Boolean(targetSrc) && !displaySrc && !loadFailed;
  const showPoster = Boolean(displaySrc) && !loadFailed;
  const neighborSrcs = DEMO_TITLES.filter((demo) => demo.id !== selected)
    .slice(0, 2)
    .map((demo) => demoSrc(demo.id));

  const liveMessage =
    (usingCustom ? props.liveError : null) ??
    (loadFailed
      ? usingCustom
        ? "Could not load this title. Check the IMDb id and API keys."
        : "Could not load the preview."
      : null) ??
    (waitingForPreview ? "Loading preview" : null) ??
    (usingCustom && !props.hasPreviewCredential ? "Add a TMDB key to preview any title." : null) ??
    (usingCustom && !props.idOk ? "Enter an IMDb id like tt1234567." : null);

  return (
    <aside
      aria-label="Preview"
      className="order-first w-full shrink-0 lg:order-none lg:sticky lg:top-4 lg:z-10 lg:w-[min(320px,32vw)]"
    >
      {showPoster && view !== "poster" ? (
        <ClientPreview landscape={props.landscape} neighborSrcs={neighborSrcs} src={displaySrc!} view={view} />
      ) : (
        <div className={`polis-poster-frame relative mx-auto overflow-hidden rounded-xl lg:max-w-none ${props.landscape ? "max-w-[400px]" : "max-w-[220px]"}`}>
          {showPoster ? (
            <>
              <img
                alt="Poster preview with the current look"
                className={`h-auto w-full object-cover transition-opacity duration-200 ${isLoading ? "opacity-60" : "opacity-100"}`}
                decoding="async"
                height={480}
                loading="eager"
                src={displaySrc!}
                width={320}
              />
              {isLoading ? (
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 bottom-0 h-1 animate-pulse bg-cyan-400/70"
                />
              ) : null}
            </>
          ) : (
            <div className={`flex items-center ${props.landscape ? "aspect-video" : "aspect-2/3"} justify-center bg-zinc-950 px-4 text-center text-sm leading-snug text-zinc-500`}>
              {liveMessage ?? "Choose a title to preview"}
            </div>
          )}
        </div>
      )}

      <div aria-label="Preview title" className="mt-3 flex justify-center gap-2 lg:justify-start" role="group">
        {DEMO_TITLES.map((demo) => (
          <button
            aria-label={demo.title}
            aria-pressed={selected === demo.id}
            className={`w-12 shrink-0 overflow-hidden rounded-md transition-opacity lg:w-auto lg:flex-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/60 ${
              selected === demo.id ? "ring-2 ring-cyan-400/80" : "opacity-60 hover:opacity-100"
            }`}
            key={demo.id}
            onClick={() => setSelected(demo.id)}
            type="button"
          >
            <img
              alt=""
              className="aspect-2/3 w-full object-cover"
              decoding="async"
              loading="lazy"
              src={demoSrc(demo.id)}
            />
          </button>
        ))}
      </div>

      <label className="mt-3 flex items-center gap-2">
        <span className="shrink-0 text-xs text-zinc-500">Any title</span>
        <input
          className="polis-input min-w-0 flex-1 font-mono text-xs"
          onChange={(e) => {
            props.onImdbChange(e.target.value.trim());
            setSelected(CUSTOM_TITLE);
          }}
          onFocus={() => setSelected(CUSTOM_TITLE)}
          placeholder="IMDb id, e.g. tt12042730"
          spellCheck={false}
          value={props.imdbPreview}
        />
      </label>

      <div className="mt-3">
        <ClientPreviewTabs onChange={setView} value={view} />
      </div>
    </aside>
  );
}
