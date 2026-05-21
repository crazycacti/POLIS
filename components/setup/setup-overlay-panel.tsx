"use client";

import type { Dispatch, SetStateAction } from "react";

import {
  SetupOverlayColor,
  SetupOverlayField,
  SetupOverlayNote,
  SetupOverlayOption,
  SetupOverlayRange,
  SetupOverlaySwitch,
} from "@/components/setup/setup-overlay-controls";
import { SetupPanel } from "@/components/setup/setup-ui";
import type { GenreMode, PosterOverlayQuery, RatingStyle } from "@/lib/poster-query";
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

export function SetupOverlayPanel(props: {
  overlay: PosterOverlayQuery;
  setOverlay: Dispatch<SetStateAction<PosterOverlayQuery>>;
}) {
  const { overlay, setOverlay } = props;
  const atDefaults = overlayStyleMatchesDefaults(overlay);

  return (
    <SetupPanel title="Overlay options">
      <div className="mb-4 flex justify-end border-b border-white/5 pb-4">
        <button
          className="polis-btn px-4 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-40"
          disabled={atDefaults}
          onClick={() => setOverlay((o) => resetOverlayStyleToDefaults(o))}
          type="button"
        >
          Reset to defaults
        </button>
      </div>

      <SetupOverlayOption
        checked={overlay.genre}
        label="Genre line"
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
            <SetupOverlayRange
              label="Bottom inset"
              max={FOOTER_PAD_Y_MAX}
              min={FOOTER_PAD_Y_MIN}
              onChange={(padY) => setGenreFooterPad(setOverlay, padY)}
              value={overlay.padY}
            />
          </>
        }
      />

      <SetupOverlayOption
        checked={overlay.rating}
        label="Rating line"
        onCheckedChange={(rating) => setOverlay((o) => ({ ...o, rating }))}
        customize={
          <>
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
            <SetupOverlaySwitch
              checked={overlay.ratingColors}
              label="Color-coded by source"
              onChange={(ratingColors) => setOverlay((o) => ({ ...o, ratingColors }))}
            />
            <SetupOverlayColor
              auto={overlay.ratingColor === "auto"}
              autoLabel="Auto text color"
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
              label="Font size"
              max={72}
              min={16}
              onChange={(ratingFontSize) => setOverlay((o) => ({ ...o, ratingFontSize }))}
              value={overlay.ratingFontSize}
            />
            <SetupOverlayRange
              label="Bottom inset"
              max={FOOTER_PAD_Y_MAX}
              min={FOOTER_PAD_Y_MIN}
              onChange={(ratingPadY) => setRatingFooterPad(setOverlay, ratingPadY)}
              value={overlay.ratingPadY}
            />
          </>
        }
      />

      <SetupOverlayOption
        checked={overlay.trendTags}
        label="Trend tags"
        onCheckedChange={(trendTags) => setOverlay((o) => ({ ...o, trendTags }))}
        customize={
          <>
            <SetupOverlayNote>
              Pill background is sampled from the poster art. One tag is shown (highest priority
              match).
            </SetupOverlayNote>
            <SetupOverlayRange
              label="Font size"
              max={72}
              min={16}
              onChange={(trendFontSize) => setOverlay((o) => ({ ...o, trendFontSize }))}
              value={overlay.trendFontSize}
            />
          </>
        }
      />

      <SetupOverlayOption
        checked={overlay.qualityTags}
        label="Quality marks (4K, Dolby, HDR)"
        onCheckedChange={(qualityTags) => setOverlay((o) => ({ ...o, qualityTags }))}
        customize={
          <>
            <SetupOverlayNote>
              Marks use MDBList keywords and release filenames. Badge backgrounds match the poster
              at 52% opacity.
            </SetupOverlayNote>
            <SetupOverlayRange
              label="Mark size"
              max={72}
              min={16}
              onChange={(qualityMarkSize) => setOverlay((o) => ({ ...o, qualityMarkSize }))}
              value={overlay.qualityMarkSize}
            />
          </>
        }
      />

      <SetupOverlayOption
        checked={overlay.ageRating}
        label="Age rating"
        onCheckedChange={(ageRating) => setOverlay((o) => ({ ...o, ageRating }))}
      />

      <SetupOverlayOption
        checked={overlay.logoOnPoster}
        label="Textless art with title logo"
        onCheckedChange={(logoOnPoster) => setOverlay((o) => ({ ...o, logoOnPoster }))}
      />
    </SetupPanel>
  );
}
