"use client";

import type { Dispatch, ReactNode, SetStateAction } from "react";

import {
  SetupOverlayColor,
  SetupOverlayField,
  SetupOverlayOption,
  SetupOverlayRange,
} from "@/components/setup/setup-overlay-controls";
import { SetupSection } from "@/components/setup/setup-ui";
import { SetupLogoPosition } from "@/components/setup/setup-logo-position";
import type {
  GenreMode,
  GridCell,
  LogoSize,
  PosterLook,
  PosterOverlayQuery,
  PosterShape,
  RatingStyle,
} from "@/lib/poster-query";
import { LOGO_SOURCES_AUTO } from "@/lib/poster-query";
import type { RatingSource } from "@/lib/ratings";

const LOGO_SOURCE_ORDERS: { value: string; label: string }[] = [
  { value: LOGO_SOURCES_AUTO, label: "Match the art" },
  { value: "tmdb,fanart,tvdb", label: "TMDB first" },
  { value: "fanart,tmdb,tvdb", label: "Fanart first" },
  { value: "tvdb,tmdb,fanart", label: "TVDB first" },
];

const RATING_SOURCES: { value: RatingSource; label: string }[] = [
  { value: "average", label: "Average" },
  { value: "imdb", label: "IMDb" },
  { value: "tmdb", label: "TMDB" },
  { value: "tomatoes", label: "Rotten Tomatoes" },
  { value: "metacritic", label: "Metacritic" },
  { value: "trakt", label: "Trakt" },
  { value: "letterboxd", label: "Letterboxd" },
  { value: "mdblist", label: "MDBList" },
];

const STYLES: { value: PosterLook; label: string }[] = [
  { value: "soft", label: "Soft" },
  { value: "classic", label: "Classic" },
];

const SHAPES: { value: PosterShape; label: string }[] = [
  { value: "poster", label: "Portrait" },
  { value: "landscape", label: "Landscape" },
];

function Segmented<T extends string>(props: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div aria-label={props.label} className="flex gap-1 rounded-full bg-zinc-900 p-1" role="group">
      {props.options.map((option) => (
        <button
          aria-pressed={props.value === option.value}
          className={`polis-focus min-h-10 rounded-full px-4 text-sm transition-colors ${
            props.value === option.value ? "polis-selected" : "text-zinc-400 hover:bg-white/5 hover:text-white"
          }`}
          key={option.value}
          onClick={() => props.onChange(option.value)}
          type="button"
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function ChipToggle(props: { label: string; pressed: boolean; onChange: (pressed: boolean) => void }) {
  return (
    <button
      aria-pressed={props.pressed}
      className={`min-h-10 rounded-full border px-4 text-sm transition-colors ${
        props.pressed
          ? "border-cyan-400/80 bg-cyan-500/20 text-white"
          : "border-white/15 text-zinc-400 hover:border-white/30 hover:text-white"
      }`}
      onClick={() => props.onChange(!props.pressed)}
      type="button"
    >
      {props.label}
    </button>
  );
}

export function SetupOverlayPanel(props: {
  overlay: PosterOverlayQuery;
  setOverlay: Dispatch<SetStateAction<PosterOverlayQuery>>;
  artworkControls: ReactNode;
}) {
  const { overlay, setOverlay } = props;
  const landscape = overlay.posterShape === "landscape";
  const classic = overlay.look === "classic" && !landscape;

  return (
    <>
      <SetupSection title="Style">
        <div className="flex flex-wrap items-center justify-between gap-3 py-3">
          {landscape ? (
            <span className="text-sm text-zinc-400">Landscape uses the soft style.</span>
          ) : (
            <Segmented
              label="Style"
              onChange={(look) => setOverlay((o) => ({ ...o, look }))}
              options={STYLES}
              value={overlay.look}
            />
          )}
        </div>
      </SetupSection>

      <SetupSection title="Artwork">
        <div className="flex flex-wrap items-center justify-between gap-3 py-3">
          <span className="text-sm text-zinc-200">Shape</span>
          <Segmented
            label="Shape"
            onChange={(posterShape) => setOverlay((o) => ({ ...o, posterShape }))}
            options={SHAPES}
            value={overlay.posterShape}
          />
        </div>
        {landscape ? (
          <p className="py-3 text-sm text-zinc-400">Landscape uses TMDB backdrops.</p>
        ) : (
          <div className="py-3">{props.artworkControls}</div>
        )}
        <SetupOverlayOption
          checked={overlay.logoOnPoster}
          label="Title logo"
          onCheckedChange={(logoOnPoster) => setOverlay((o) => ({ ...o, logoOnPoster }))}
          customize={
            <>
              {landscape ? null : (
                <SetupLogoPosition
                  onChange={(gridCell: GridCell) => setOverlay((o) => ({ ...o, gridCell }))}
                  value={overlay.gridCell}
                />
              )}
              <SetupOverlayField label="Size">
                <select
                  className="polis-select"
                  onChange={(e) =>
                    setOverlay((o) => ({ ...o, logoSize: e.target.value as LogoSize }))
                  }
                  value={overlay.logoSize}
                >
                  <option value="small">Small</option>
                  <option value="medium">Medium</option>
                  <option value="large">Large</option>
                </select>
              </SetupOverlayField>
              <SetupOverlayField label="Logo source">
                <select
                  className="polis-select"
                  onChange={(e) => setOverlay((o) => ({ ...o, logoSources: e.target.value }))}
                  value={overlay.logoSources}
                >
                  {LOGO_SOURCE_ORDERS.map((order) => (
                    <option key={order.value} value={order.value}>
                      {order.label}
                    </option>
                  ))}
                  {LOGO_SOURCE_ORDERS.some((order) => order.value === overlay.logoSources) ? null : (
                    <option value={overlay.logoSources}>Custom</option>
                  )}
                </select>
              </SetupOverlayField>
            </>
          }
        />
      </SetupSection>

      <SetupSection title={landscape ? "Tags and badges" : "Top of poster"}>
        <SetupOverlayOption
          checked={overlay.trendTags}
          label="Trend tag"
          onCheckedChange={(trendTags) => setOverlay((o) => ({ ...o, trendTags }))}
          customize={
            <SetupOverlayRange
              label="Font size"
              max={72}
              min={16}
              onChange={(trendFontSize) => setOverlay((o) => ({ ...o, trendFontSize }))}
              value={overlay.trendFontSize}
            />
          }
        />
        <div className="py-3">
          <p className="mb-3 text-sm text-zinc-200" id="badges-label">
            Badges
          </p>
          <div aria-labelledby="badges-label" className="flex flex-wrap gap-2" role="group">
            <ChipToggle
              label="4K, HDR and Dolby"
              onChange={(qualityTags) => setOverlay((o) => ({ ...o, qualityTags }))}
              pressed={overlay.qualityTags}
            />
            <ChipToggle
              label="Age rating"
              onChange={(ageRating) => setOverlay((o) => ({ ...o, ageRating }))}
              pressed={overlay.ageRating}
            />
          </div>
          {overlay.qualityTags || overlay.ageRating ? (
            <details className="polis-overlay-details mt-3">
              <summary>Customize</summary>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <SetupOverlayRange
                  label="Badge size"
                  max={72}
                  min={16}
                  onChange={(qualityMarkSize) => setOverlay((o) => ({ ...o, qualityMarkSize }))}
                  value={overlay.qualityMarkSize}
                />
              </div>
            </details>
          ) : null}
        </div>
      </SetupSection>

      <SetupSection title={landscape ? "Rating" : "Bottom of poster"}>
        <SetupOverlayOption
          checked={overlay.rating}
          label="Rating"
          onCheckedChange={(rating) => setOverlay((o) => ({ ...o, rating }))}
          customize={
            <>
              <SetupOverlayField label="Source">
                <select
                  className="polis-select"
                  onChange={(e) =>
                    setOverlay((o) => ({
                      ...o,
                      ratingSource: e.target.value as RatingSource,
                    }))
                  }
                  value={overlay.ratingSource}
                >
                  {RATING_SOURCES.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </SetupOverlayField>
              {classic ? (
                <SetupOverlayField label="Format">
                  <select
                    className="polis-select"
                    onChange={(e) =>
                      setOverlay((o) => ({ ...o, ratingStyle: e.target.value as RatingStyle }))
                    }
                    value={overlay.ratingStyle}
                  >
                    <option value="min">Star + score (★ 8.2)</option>
                    <option value="score">Score (8.2)</option>
                    <option value="votes">Score + votes</option>
                  </select>
                </SetupOverlayField>
              ) : null}
              <SetupOverlayColor
                auto={overlay.ratingColor === "auto"}
                autoLabel={classic ? "Auto text color" : "Ring color follows the score"}
                color={overlay.ratingColor}
                onAutoChange={(auto) =>
                  setOverlay((o) => ({
                    ...o,
                    ratingColor: auto ? "auto" : "#ffffff",
                  }))
                }
                onColorChange={(ratingColor) => setOverlay((o) => ({ ...o, ratingColor }))}
              />
              <SetupOverlayRange
                label={classic ? "Font size" : "Ring size"}
                max={72}
                min={16}
                onChange={(ratingFontSize) => setOverlay((o) => ({ ...o, ratingFontSize }))}
                value={overlay.ratingFontSize}
              />
            </>
          }
        />
        {landscape ? null : (
        <SetupOverlayOption
          checked={overlay.genre}
          label="Genre"
          onCheckedChange={(genre) => setOverlay((o) => ({ ...o, genre }))}
          customize={
            <>
              <SetupOverlayField label="Genres">
                <select
                  className="polis-select"
                  onChange={(e) =>
                    setOverlay((o) => ({ ...o, genreMode: e.target.value as GenreMode }))
                  }
                  value={overlay.genreMode}
                >
                  <option value="first">Main genre</option>
                  <option value="top3">Up to three</option>
                </select>
              </SetupOverlayField>
              <SetupOverlayColor
                auto={overlay.genreColor === "auto"}
                autoLabel="Match poster colors"
                color={overlay.genreColor}
                onAutoChange={(auto) =>
                  setOverlay((o) => ({
                    ...o,
                    genreColor: auto ? "auto" : "#e4e4e7",
                  }))
                }
                onColorChange={(genreColor) => setOverlay((o) => ({ ...o, genreColor }))}
              />
              <SetupOverlayRange
                label="Font size"
                max={72}
                min={16}
                onChange={(genreFontSize) => setOverlay((o) => ({ ...o, genreFontSize }))}
                value={overlay.genreFontSize}
              />
            </>
          }
        />
        )}
      </SetupSection>
    </>
  );
}
