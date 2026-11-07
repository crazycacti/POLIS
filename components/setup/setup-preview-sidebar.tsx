"use client";

import { useMemo, useState } from "react";

import {
  ClientPreview,
  ClientPreviewTabs,
  type ClientPreviewView,
} from "@/components/setup/setup-client-previews";
import { SelectionCheck, SetupSegmented } from "@/components/setup/setup-ui";
import { usePreloadedPosterSrc } from "@/components/setup/use-preloaded-poster-src";
import { DEMO_TITLES } from "@/lib/demo-catalog";
import { resolveSetupDemoPosterSrc } from "@/lib/demo-poster-urls";
import type { PosterShape } from "@/lib/poster-query";
import type { PreviewTitle } from "@/lib/preview-title-list";

const CUSTOM_TITLE = "custom";

type TitleOption = { key: string; label: string; src: string };

const SHAPES: { value: PosterShape; label: string }[] = [
  { value: "poster", label: "Portrait" },
  { value: "landscape", label: "Landscape" },
];

export function SetupPreviewSidebar(props: {
  imdbPreview: string;
  onImdbChange: (value: string) => void;
  idOk: boolean;
  livePreviewSrc: string | null;
  liveTitles: PreviewTitle[];
  posterSrcForImdb: (imdbId: string) => string;
  liveError: string | null;
  hasPreviewCredential: boolean;
  overlayQueryString: string;
  showcaseQueryString: string;
  landscape: boolean;
  shape: PosterShape;
  onShapeChange: (shape: PosterShape) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState<ClientPreviewView>("poster");

  const { liveTitles, posterSrcForImdb, overlayQueryString, showcaseQueryString } = props;
  const options = useMemo<TitleOption[]>(
    () =>
      liveTitles.length > 0
        ? liveTitles.map((title) => ({
            key: title.imdbId,
            label: title.title,
            src: posterSrcForImdb(title.imdbId),
          }))
        : DEMO_TITLES.map((demo) => ({
            key: demo.id,
            label: demo.title,
            src: resolveSetupDemoPosterSrc(demo.id, overlayQueryString, showcaseQueryString),
          })),
    [liveTitles, overlayQueryString, posterSrcForImdb, showcaseQueryString],
  );
  const usingCustom = selected === CUSTOM_TITLE;
  const activeOption = usingCustom
    ? null
    : (options.find((option) => option.key === selected) ?? options[0] ?? null);
  const targetSrc = usingCustom ? props.livePreviewSrc : (activeOption?.src ?? null);
  const { displaySrc, isLoading, loadFailed } = usePreloadedPosterSrc(targetSrc);
  const waitingForPreview = Boolean(targetSrc) && !displaySrc && !loadFailed;
  const showPoster = Boolean(displaySrc) && !loadFailed;
  const neighborSrcs = options
    .filter((option) => option.key !== activeOption?.key)
    .slice(0, 2)
    .map((option) => option.src);

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
      <div className="mb-3 flex justify-center lg:justify-start">
        <SetupSegmented label="Shape" onChange={props.onShapeChange} options={SHAPES} value={props.shape} />
      </div>

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
                  className="pointer-events-none absolute inset-x-0 bottom-0 h-1 animate-pulse motion-reduce:animate-none bg-cyan-400/70"
                />
              ) : null}
            </>
          ) : (
            <div className={`flex items-center ${props.landscape ? "aspect-video" : "aspect-2/3"} justify-center bg-zinc-950 px-4 text-center text-sm leading-snug text-zinc-400`}>
              {liveMessage ?? "Choose a title to preview"}
            </div>
          )}
        </div>
      )}

      <div aria-label="Preview title" className="mt-3 flex justify-center gap-2 lg:justify-start" role="group">
        {options.map((option) => {
          const isSelected = option.key === activeOption?.key;
          return (
            <button
              aria-label={option.label}
              aria-pressed={isSelected}
              className="polis-focus relative w-12 shrink-0 rounded-md lg:w-auto lg:flex-1"
              key={option.key}
              onClick={() => setSelected(option.key)}
              title={option.label}
              type="button"
            >
              <img
                alt=""
                className={`${props.landscape ? "aspect-video" : "aspect-2/3"} w-full rounded-md object-cover ${isSelected ? "ring-2 ring-cyan-400" : ""}`}
                decoding="async"
                loading="lazy"
                src={option.src}
              />
              {isSelected ? <SelectionCheck /> : null}
            </button>
          );
        })}
      </div>

      <label className="mt-3 flex items-center gap-2">
        <span className="shrink-0 text-xs text-zinc-400">Any title</span>
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
