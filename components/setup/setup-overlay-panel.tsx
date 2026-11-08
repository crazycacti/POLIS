"use client";

import { ChevronDown, Star } from "lucide-react";
import { useRef, type Dispatch, type KeyboardEvent, type ReactNode, type SetStateAction } from "react";

import { PolisSwitch } from "@/components/setup/polis-switch";
import {
  SetupOverlayColor,
  SetupOverlayField,
  SetupOverlayRange,
} from "@/components/setup/setup-overlay-controls";
import { LOGO_CELL_LABELS, SetupLogoPosition } from "@/components/setup/setup-logo-position";
import {
  posterPartBodyId,
  posterPartHeaderId,
  type PosterPart,
} from "@/components/setup/setup-poster-parts";
import { SelectionCheck } from "@/components/setup/setup-ui";
import {
  mapLegacyArtworkMovieSource,
  mapLegacyArtworkSource,
  POSTER_ARTWORK_FALLBACK_UI_OPTIONS,
  POSTER_ARTWORK_MOVIE_UI_OPTIONS,
  POSTER_ARTWORK_UI_OPTIONS,
} from "@/lib/artwork-source-ui";
import type {
  GenreMode,
  GridCell,
  LogoSize,
  PosterLook,
  PosterOverlayQuery,
  RatingStyle,
  ShadeLevel,
} from "@/lib/poster-query";
import { LOGO_SOURCES_AUTO, PILL_ALPHA_MAX, PILL_ALPHA_MIN } from "@/lib/poster-query";
import { MAX_RATING_BADGES, parseRatingBadgeSources, type RatingBadgeSource, type RatingSource } from "@/lib/ratings";

const LOGO_SOURCE_ORDERS: { value: string; label: string }[] = [
  { value: LOGO_SOURCES_AUTO, label: "Match the art" },
  { value: "tmdb,fanart,tvdb", label: "TMDB first" },
  { value: "fanart,tmdb,tvdb", label: "Fanart first" },
  { value: "tvdb,tmdb,fanart", label: "TVDB first" },
];

const CUSTOM_LOGO_SOURCE_LABEL = "Custom";

const LOGO_SIZES: { value: LogoSize; label: string }[] = [
  { value: "small", label: "Small" },
  { value: "medium", label: "Medium" },
  { value: "large", label: "Large" },
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

const RATING_BADGE_OPTIONS: { value: RatingBadgeSource; label: string }[] = [
  { value: "imdb", label: "IMDb" },
  { value: "tomatoes", label: "Rotten Tomatoes" },
  { value: "tomatoesaudience", label: "RT Audience" },
  { value: "metacritic", label: "Metacritic" },
  { value: "letterboxd", label: "Letterboxd" },
  { value: "trakt", label: "Trakt" },
  { value: "tmdb", label: "TMDB" },
  { value: "mdblist", label: "MDBList" },
];

function toggleRatingBadge(current: string, source: RatingBadgeSource, on: boolean): string {
  const list = parseRatingBadgeSources(current).filter((s) => s !== source);
  if (on) list.push(source);
  return list.slice(0, MAX_RATING_BADGES).join(",");
}

const SCORE_STYLES: { value: PosterLook; label: string }[] = [
  { value: "soft", label: "Circle" },
  { value: "classic", label: "Star pill" },
];

const SCORE_SAMPLE = "8.4";

const GENRE_MODES: { value: GenreMode; label: string }[] = [
  { value: "first", label: "Main genre" },
  { value: "top3", label: "Up to three" },
];

const SHADES: { value: ShadeLevel; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "light", label: "Light" },
  { value: "strong", label: "Strong" },
  { value: "off", label: "Off" },
];

const QUALITY_BADGE_LABEL = "4K, HDR and Dolby";
const AGE_BADGE_LABEL = "Age rating";
const OFF_SUMMARY = "Off";
const LABEL_RANGE_MIN = 16;
const LABEL_RANGE_MAX = 72;
const LANDSCAPE_ARTWORK_NOTE = "Landscape uses TMDB backdrops.";

function lowerFirst(label: string): string {
  const second = label.charAt(1);
  return second && second === second.toLowerCase() ? label.charAt(0).toLowerCase() + label.slice(1) : label;
}

function shortSourceLabel(options: { value: string; label: string }[], value: string): string {
  const label = options.find((option) => option.value === value)?.label ?? value;
  return label.replace(/ \(.*\)$/, "");
}

function artworkSummary(overlay: PosterOverlayQuery, landscape: boolean): string {
  if (landscape) return "TMDB backdrops";
  const artwork = mapLegacyArtworkSource(overlay.artwork);
  const main = shortSourceLabel(POSTER_ARTWORK_UI_OPTIONS, artwork);
  const fallback = shortSourceLabel(POSTER_ARTWORK_FALLBACK_UI_OPTIONS, overlay.artworkFallback);
  if (artwork !== "tvdb") return `${main}, then ${fallback}`;
  const movie = shortSourceLabel(
    POSTER_ARTWORK_MOVIE_UI_OPTIONS,
    mapLegacyArtworkMovieSource(overlay.artworkMovie),
  );
  return `${main}, movies from ${movie}, then ${fallback}`;
}

function logoSourceLabel(logoSources: string): string {
  return LOGO_SOURCE_ORDERS.find((order) => order.value === logoSources)?.label ?? CUSTOM_LOGO_SOURCE_LABEL;
}

function logoSummary(overlay: PosterOverlayQuery, landscape: boolean): string {
  if (!overlay.logoOnPoster) return OFF_SUMMARY;
  const size = LOGO_SIZES.find((option) => option.value === overlay.logoSize)?.label ?? overlay.logoSize;
  const parts = [size];
  if (!landscape) parts.push(lowerFirst(LOGO_CELL_LABELS[overlay.gridCell]));
  parts.push(lowerFirst(logoSourceLabel(overlay.logoSources)));
  return parts.join(", ");
}

function badgesSummary(overlay: PosterOverlayQuery): string {
  const on = [
    overlay.qualityTags ? QUALITY_BADGE_LABEL : null,
    overlay.ageRating ? AGE_BADGE_LABEL : null,
  ].filter((label): label is string => label != null);
  return on.length > 0 ? on.join(", ") : OFF_SUMMARY;
}

function ratingSummary(overlay: PosterOverlayQuery, classic: boolean): string {
  if (!overlay.rating) return OFF_SUMMARY;
  const badges = parseRatingBadgeSources(overlay.ratingBadges);
  if (badges.length > 0) {
    const names = badges.map((b) => RATING_BADGE_OPTIONS.find((o) => o.value === b)?.label ?? b);
    return `${names.join(", ")} badges`;
  }
  const source = RATING_SOURCES.find((option) => option.value === overlay.ratingSource)?.label ?? overlay.ratingSource;
  return `${source}, ${classic ? "star pill" : "circle"}`;
}

function genreSummary(overlay: PosterOverlayQuery): string {
  if (!overlay.genre) return OFF_SUMMARY;
  return GENRE_MODES.find((option) => option.value === overlay.genreMode)?.label ?? overlay.genreMode;
}

function shadeSummary(overlay: PosterOverlayQuery): string {
  const shade = SHADES.find((option) => option.value === overlay.shade)?.label ?? overlay.shade;
  return `${shade}, labels ${overlay.pillAlpha}%`;
}

function ChipToggle(props: {
  label: string;
  pressed: boolean;
  onChange: (pressed: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      aria-pressed={props.pressed}
      disabled={props.disabled}
      className={`polis-focus min-h-10 rounded-full border px-4 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 pointer-coarse:min-h-11 ${
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

function ScoreStyleSample(props: { look: PosterLook }) {
  if (props.look === "classic") {
    return (
      <span aria-hidden className="flex h-7 items-center gap-1 rounded-full bg-black/70 px-2.5 text-xs font-semibold text-white ring-1 ring-white/15">
        <Star aria-hidden className="h-3 w-3 fill-amber-400 text-amber-400" />
        {SCORE_SAMPLE}
      </span>
    );
  }
  return (
    <span aria-hidden className="flex h-9 w-9 items-center justify-center rounded-full border-[3px] border-emerald-400 bg-black/70 text-xs font-semibold text-white">
      {SCORE_SAMPLE}
    </span>
  );
}

function ScoreStylePicker(props: { value: PosterLook; onChange: (look: PosterLook) => void }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const step =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? -1
          : 0;
    if (step === 0) return;
    event.preventDefault();
    const current = SCORE_STYLES.findIndex((option) => option.value === props.value);
    const next = (current + step + SCORE_STYLES.length) % SCORE_STYLES.length;
    props.onChange(SCORE_STYLES[next]!.value);
    refs.current[next]?.focus();
  }

  return (
    <div className="sm:col-span-2">
      <span className="mb-1.5 block text-sm text-zinc-300" id="score-style-label">
        Score style
      </span>
      <div aria-labelledby="score-style-label" className="flex gap-3" onKeyDown={onKeyDown} role="radiogroup">
        {SCORE_STYLES.map((option, index) => {
          const selected = props.value === option.value;
          return (
            <button
              aria-checked={selected}
              className="polis-focus group flex w-24 flex-col items-center gap-2 rounded-lg p-1.5"
              key={option.value}
              onClick={() => props.onChange(option.value)}
              ref={(node) => {
                refs.current[index] = node;
              }}
              role="radio"
              tabIndex={selected ? 0 : -1}
              type="button"
            >
              <span
                className={`relative flex h-14 w-full items-center justify-center rounded-md bg-zinc-800 ${selected ? "ring-2 ring-cyan-400" : ""}`}
              >
                <ScoreStyleSample look={option.value} />
                {selected ? <SelectionCheck /> : null}
              </span>
              <span className={`text-sm ${selected ? "text-white" : "text-zinc-400 group-hover:text-zinc-200"}`}>
                {option.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PosterPartRow(props: {
  part: PosterPart;
  name: string;
  summary: string;
  open: boolean;
  onToggle: () => void;
  enabled?: { checked: boolean; onChange: (checked: boolean) => void };
  children: ReactNode;
}) {
  const headerId = posterPartHeaderId(props.part);
  const bodyId = posterPartBodyId(props.part);
  return (
    <li className="border-b border-white/5 last:border-b-0">
      <div className="flex items-center gap-3">
        <button
          aria-controls={bodyId}
          aria-expanded={props.open}
          className="polis-focus flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-md py-2 text-left"
          id={headerId}
          onClick={props.onToggle}
          type="button"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-sm text-white">{props.name}</span>
            <span className="block truncate text-sm text-zinc-400">{props.summary}</span>
          </span>
          <ChevronDown
            aria-hidden
            className={`h-4 w-4 shrink-0 text-zinc-500 transition-transform motion-reduce:transition-none ${props.open ? "rotate-180" : ""}`}
          />
        </button>
        <span className="flex w-12 shrink-0 justify-end">
          {props.enabled ? (
            <PolisSwitch
              aria-label={props.name}
              checked={props.enabled.checked}
              onChange={props.enabled.onChange}
            />
          ) : null}
        </span>
      </div>
      <div
        aria-labelledby={headerId}
        className="grid gap-4 pb-5 pt-1 sm:grid-cols-2"
        hidden={!props.open}
        id={bodyId}
        role="region"
      >
        {props.open ? props.children : null}
      </div>
    </li>
  );
}

export function SetupOverlayPanel(props: {
  overlay: PosterOverlayQuery;
  setOverlay: Dispatch<SetStateAction<PosterOverlayQuery>>;
  artworkControls: ReactNode;
  openPart: PosterPart | null;
  onOpenPartChange: (part: PosterPart | null) => void;
}) {
  const { overlay, setOverlay, openPart, onOpenPartChange } = props;
  const landscape = overlay.posterShape === "landscape";
  const classic = overlay.look === "classic" && !landscape;
  const badgeMode = parseRatingBadgeSources(overlay.ratingBadges).length > 0;
  const toggle = (part: PosterPart) => () => onOpenPartChange(openPart === part ? null : part);

  return (
    <ul aria-label="Poster parts" className="mb-10">
      <PosterPartRow
        name="Artwork"
        onToggle={toggle("artwork")}
        open={openPart === "artwork"}
        part="artwork"
        summary={artworkSummary(overlay, landscape)}
      >
        {landscape ? (
          <p className="text-sm text-zinc-400 sm:col-span-2">{LANDSCAPE_ARTWORK_NOTE}</p>
        ) : (
          <div className="sm:col-span-2">{props.artworkControls}</div>
        )}
      </PosterPartRow>

      <PosterPartRow
        enabled={{
          checked: overlay.logoOnPoster,
          onChange: (logoOnPoster) => setOverlay((o) => ({ ...o, logoOnPoster })),
        }}
        name="Title logo"
        onToggle={toggle("logo")}
        open={openPart === "logo"}
        part="logo"
        summary={logoSummary(overlay, landscape)}
      >
        {landscape ? null : (
          <SetupLogoPosition
            onChange={(gridCell: GridCell) => setOverlay((o) => ({ ...o, gridCell }))}
            value={overlay.gridCell}
          />
        )}
        <div className="grid content-start gap-4">
          <SetupOverlayField label="Size">
            <select
              className="polis-select w-full"
              onChange={(e) => setOverlay((o) => ({ ...o, logoSize: e.target.value as LogoSize }))}
              value={overlay.logoSize}
            >
              {LOGO_SIZES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </SetupOverlayField>
          <SetupOverlayField label="Logo source">
            <select
              className="polis-select w-full"
              onChange={(e) => setOverlay((o) => ({ ...o, logoSources: e.target.value }))}
              value={overlay.logoSources}
            >
              {LOGO_SOURCE_ORDERS.map((order) => (
                <option key={order.value} value={order.value}>
                  {order.label}
                </option>
              ))}
              {LOGO_SOURCE_ORDERS.some((order) => order.value === overlay.logoSources) ? null : (
                <option value={overlay.logoSources}>{CUSTOM_LOGO_SOURCE_LABEL}</option>
              )}
            </select>
          </SetupOverlayField>
        </div>
      </PosterPartRow>

      <PosterPartRow
        enabled={{
          checked: overlay.trendTags,
          onChange: (trendTags) => setOverlay((o) => ({ ...o, trendTags })),
        }}
        name="Trend tag"
        onToggle={toggle("trend")}
        open={openPart === "trend"}
        part="trend"
        summary={overlay.trendTags ? `${overlay.trendFontSize}px` : OFF_SUMMARY}
      >
        <SetupOverlayRange
          label="Font size"
          max={LABEL_RANGE_MAX}
          min={LABEL_RANGE_MIN}
          onChange={(trendFontSize) => setOverlay((o) => ({ ...o, trendFontSize }))}
          value={overlay.trendFontSize}
        />
      </PosterPartRow>

      <PosterPartRow
        name="Badges"
        onToggle={toggle("badges")}
        open={openPart === "badges"}
        part="badges"
        summary={badgesSummary(overlay)}
      >
        <div aria-label="Badges" className="flex flex-wrap gap-2 sm:col-span-2" role="group">
          <ChipToggle
            label={QUALITY_BADGE_LABEL}
            onChange={(qualityTags) => setOverlay((o) => ({ ...o, qualityTags }))}
            pressed={overlay.qualityTags}
          />
          <ChipToggle
            label={AGE_BADGE_LABEL}
            onChange={(ageRating) => setOverlay((o) => ({ ...o, ageRating }))}
            pressed={overlay.ageRating}
          />
        </div>
        {overlay.qualityTags || overlay.ageRating ? (
          <SetupOverlayRange
            label="Badge size"
            max={LABEL_RANGE_MAX}
            min={LABEL_RANGE_MIN}
            onChange={(qualityMarkSize) => setOverlay((o) => ({ ...o, qualityMarkSize }))}
            value={overlay.qualityMarkSize}
          />
        ) : null}
      </PosterPartRow>

      <PosterPartRow
        enabled={{
          checked: overlay.rating,
          onChange: (rating) => setOverlay((o) => ({ ...o, rating })),
        }}
        name="Rating"
        onToggle={toggle("rating")}
        open={openPart === "rating"}
        part="rating"
        summary={ratingSummary(overlay, classic)}
      >
        <div aria-labelledby="rating-sites-label" className="sm:col-span-2" role="group">
          <span className="mb-1.5 block text-sm text-zinc-300" id="rating-sites-label">
            Rating sites
          </span>
          <div className="flex flex-wrap gap-2">
            {RATING_BADGE_OPTIONS.map((option) => {
              const selected = parseRatingBadgeSources(overlay.ratingBadges);
              const pressed = selected.includes(option.value);
              return (
                <ChipToggle
                  disabled={!pressed && selected.length >= MAX_RATING_BADGES}
                  key={option.value}
                  label={option.label}
                  onChange={(on) =>
                    setOverlay((o) => ({ ...o, ratingBadges: toggleRatingBadge(o.ratingBadges, option.value, on) }))
                  }
                  pressed={pressed}
                />
              );
            })}
          </div>
        </div>
        {landscape || badgeMode ? null : (
          <ScoreStylePicker
            onChange={(look) => setOverlay((o) => ({ ...o, look }))}
            value={overlay.look}
          />
        )}
        {badgeMode ? null : (
        <SetupOverlayField label="Source">
          <select
            className="polis-select w-full"
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
        )}
        {classic && !badgeMode ? (
          <SetupOverlayField label="Format">
            <select
              className="polis-select w-full"
              onChange={(e) => setOverlay((o) => ({ ...o, ratingStyle: e.target.value as RatingStyle }))}
              value={overlay.ratingStyle}
            >
              <option value="min">Star + score (★ 8.2)</option>
              <option value="score">Score (8.2)</option>
              <option value="votes">Score + votes</option>
            </select>
          </SetupOverlayField>
        ) : null}
        <SetupOverlayRange
          label={badgeMode ? "Badge size" : classic ? "Font size" : "Ring size"}
          max={LABEL_RANGE_MAX}
          min={LABEL_RANGE_MIN}
          onChange={(ratingFontSize) => setOverlay((o) => ({ ...o, ratingFontSize }))}
          value={overlay.ratingFontSize}
        />
{badgeMode ? null : (
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
        )}
      </PosterPartRow>

      {landscape ? null : (
        <PosterPartRow
          enabled={{
            checked: overlay.genre,
            onChange: (genre) => setOverlay((o) => ({ ...o, genre })),
          }}
          name="Genre"
          onToggle={toggle("genre")}
          open={openPart === "genre"}
          part="genre"
          summary={genreSummary(overlay)}
        >
          <SetupOverlayField label="Genres">
            <select
              className="polis-select w-full"
              onChange={(e) => setOverlay((o) => ({ ...o, genreMode: e.target.value as GenreMode }))}
              value={overlay.genreMode}
            >
              {GENRE_MODES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </SetupOverlayField>
          <SetupOverlayRange
            label="Font size"
            max={LABEL_RANGE_MAX}
            min={LABEL_RANGE_MIN}
            onChange={(genreFontSize) => setOverlay((o) => ({ ...o, genreFontSize }))}
            value={overlay.genreFontSize}
          />
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
        </PosterPartRow>
      )}

      <PosterPartRow
        name="Shade and labels"
        onToggle={toggle("shade")}
        open={openPart === "shade"}
        part="shade"
        summary={shadeSummary(overlay)}
      >
        <SetupOverlayField label="Shade">
          <select
            className="polis-select w-full"
            onChange={(e) => setOverlay((o) => ({ ...o, shade: e.target.value as ShadeLevel }))}
            value={overlay.shade}
          >
            {SHADES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </SetupOverlayField>
        <SetupOverlayRange
          label="Label background"
          max={PILL_ALPHA_MAX}
          min={PILL_ALPHA_MIN}
          onChange={(pillAlpha) => setOverlay((o) => ({ ...o, pillAlpha }))}
          unit="%"
          value={overlay.pillAlpha}
        />
      </PosterPartRow>
    </ul>
  );
}
