"use client";

import type { Dispatch, ReactNode, SetStateAction } from "react";

import {
  SetupOverlayColor,
  SetupOverlayField,
  SetupOverlayOption,
  SetupOverlayRange,
  SetupOverlaySwitch,
} from "@/components/setup/setup-overlay-controls";
import { SetupSection } from "@/components/setup/setup-ui";
import { SetupLogoPosition } from "@/components/setup/setup-logo-position";
import type {
  GenreMode,
  GridCell,
  LogoSize,
  PosterLook,
  PosterOverlayQuery,
  RatingStyle,
} from "@/lib/poster-query";
import {
  FOOTER_PAD_Y_MAX,
  FOOTER_PAD_Y_MIN,
  overlayStyleMatchesDefaults,
  resetOverlayStyleToDefaults,
} from "@/lib/poster-query";
import type { RatingSource } from "@/lib/ratings";

function setGenreFooterPad(
  setOverlay: Dispatch<SetStateAction<PosterOverlayQuery>>,
  padY: number,
) {
  setOverlay((o) =>
    o.genre && o.rating ? { ...o, padY, ratingPadY: padY } : { ...o, padY },
  );
}

function setRatingFooterPad(
  setOverlay: Dispatch<SetStateAction<PosterOverlayQuery>>,
  ratingPadY: number,
) {
  setOverlay((o) =>
    o.genre && o.rating ? { ...o, padY: ratingPadY, ratingPadY } : { ...o, ratingPadY },
  );
}

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

function ChipToggle(props: { label: string; pressed: boolean; onChange: (pressed: boolean) => void }) {
  return (
    <button
      aria-pressed={props.pressed}
      className={`min-h-10 rounded-full border px-4 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/60 ${
        props.pressed
          ? "border-cyan-400/80 bg-cyan-500/15 text-white"
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
  const atDefaults = overlayStyleMatchesDefaults(overlay);
  const classic = overlay.look === "classic";

  return (
    <>
      <SetupSection title="Style">
        <div className="flex flex-wrap items-center justify-between gap-3 py-3">
          <div aria-label="Style" className="flex gap-1 rounded-full bg-zinc-900 p-1" role="group">
            {STYLES.map((style) => (
              <button
                aria-pressed={overlay.look === style.value}
                className={`min-h-9 rounded-full px-4 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/60 ${
                  overlay.look === style.value ? "bg-zinc-700 text-white" : "text-zinc-400 hover:text-white"
                }`}
                key={style.value}
                onClick={() => setOverlay((o) => ({ ...o, look: style.value }))}
                type="button"
              >
                {style.label}
              </button>
            ))}
          </div>
          <button
            className="polis-link-btn disabled:cursor-not-allowed disabled:opacity-40"
            disabled={atDefaults}
            onClick={() => setOverlay((o) => resetOverlayStyleToDefaults(o))}
            type="button"
          >
            Reset to defaults
          </button>
        </div>
      </SetupSection>

      <SetupSection title="Artwork">
        <div className="py-3">{props.artworkControls}</div>
        <SetupOverlayOption
          checked={overlay.logoOnPoster}
          label="Title logo"
          onCheckedChange={(logoOnPoster) => setOverlay((o) => ({ ...o, logoOnPoster }))}
          customize={
            <>
              {classic ? null : (
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
            </>
          }
        />
      </SetupSection>

      <SetupSection title="Top of poster">
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

      <SetupSection title="Bottom of poster">
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
              {classic ? (
                <SetupOverlaySwitch
                  checked={overlay.ratingColors}
                  label="Color-coded by source"
                  onChange={(ratingColors) => setOverlay((o) => ({ ...o, ratingColors }))}
                />
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
              {classic ? (
                <SetupOverlayRange
                  label="Bottom inset"
                  max={FOOTER_PAD_Y_MAX}
                  min={FOOTER_PAD_Y_MIN}
                  onChange={(ratingPadY) => setRatingFooterPad(setOverlay, ratingPadY)}
                  value={overlay.ratingPadY}
                />
              ) : null}
            </>
          }
        />
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
              {classic ? (
                <SetupOverlayRange
                  label="Bottom inset"
                  max={FOOTER_PAD_Y_MAX}
                  min={FOOTER_PAD_Y_MIN}
                  onChange={(padY) => setGenreFooterPad(setOverlay, padY)}
                  value={overlay.padY}
                />
              ) : null}
            </>
          }
        />
      </SetupSection>
    </>
  );
}
