import type { RatingSource } from "@/lib/ratings";
import { parseRatingSource } from "@/lib/ratings";

export type PosterArtworkSource =
  | "auto"
  | "tmdb"
  | "fanart"
  | "tvdb"
  | "metahub"
  | "anilist"
  | "kitsu"
  | "mal";

export type PosterArtworkFallback = "metahub" | "tmdb" | "fanart" | "tvdb";

export type PosterArtworkMovieSource = Exclude<PosterArtworkSource, "tvdb">;

export type GenreMode = "first" | "top3";

export type RatingStyle = "min" | "score" | "votes";

export type OverlayLayout = "stack" | "row";

export type GridCell = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export type PosterOverlayQuery = {
  genre: boolean;
  rating: boolean;
  trendTags: boolean;
  qualityTags: boolean;
  ageRating: boolean;
  logoOnPoster: boolean;
  ratingSource: RatingSource;
  artwork: PosterArtworkSource;
  artworkMovie: PosterArtworkMovieSource;
  artworkFallback: PosterArtworkFallback;
  genreMode: GenreMode;
  ratingStyle: RatingStyle;
  ratingColors: boolean;
  layout: OverlayLayout;
  gridCell: GridCell;
  genreColor: string;
  ratingColor: string;
  genreFontSize: number;
  ratingFontSize: number;
  trendFontSize: number;
  qualityMarkSize: number;
  padX: number;
  padY: number;
  ratingPadY: number;
  lineGap: number;
  trendRank: number | null;
};

export const FOOTER_PAD_Y_MIN = 12;
export const FOOTER_PAD_Y_MAX = 85;

export const POSTER_OVERLAY_DEFAULTS: PosterOverlayQuery = {
  genre: true,
  rating: true,
  trendTags: true,
  qualityTags: false,
  ageRating: false,
  logoOnPoster: true,
  ratingSource: "average",
  artwork: "tmdb",
  artworkMovie: "tmdb",
  artworkFallback: "metahub",
  genreMode: "first",
  ratingStyle: "min",
  ratingColors: false,
  layout: "row",
  gridCell: 7,
  genreColor: "auto",
  ratingColor: "auto",
  genreFontSize: 45,
  ratingFontSize: 57,
  trendFontSize: 45,
  qualityMarkSize: 46,
  padX: 24,
  padY: 16,
  ratingPadY: 16,
  lineGap: 14,
  trendRank: null,
};

const OVERLAY_STYLE_DEFAULT_KEYS = [
  "genre",
  "rating",
  "trendTags",
  "qualityTags",
  "ageRating",
  "logoOnPoster",
  "ratingSource",
  "genreMode",
  "ratingStyle",
  "ratingColors",
  "layout",
  "gridCell",
  "genreColor",
  "ratingColor",
  "genreFontSize",
  "ratingFontSize",
  "trendFontSize",
  "qualityMarkSize",
  "padX",
  "padY",
  "ratingPadY",
  "lineGap",
] as const satisfies readonly (keyof PosterOverlayQuery)[];

function parseFontParam(
  searchParams: URLSearchParams,
  key: string,
  legacyFont: number | null,
  fallback: number,
): number {
  const raw = clamp(Number(searchParams.get(key) ?? NaN), 16, 72);
  if (Number.isFinite(raw)) return raw;
  if (legacyFont != null) return legacyFont;
  return fallback;
}

export function overlayStyleMatchesDefaults(overlay: PosterOverlayQuery): boolean {
  for (const key of OVERLAY_STYLE_DEFAULT_KEYS) {
    if (overlay[key] !== POSTER_OVERLAY_DEFAULTS[key]) return false;
  }
  return true;
}

export function resetOverlayStyleToDefaults(overlay: PosterOverlayQuery): PosterOverlayQuery {
  const preserved = {
    artwork: overlay.artwork,
    artworkMovie: overlay.artworkMovie,
    artworkFallback: overlay.artworkFallback,
  };
  return { ...POSTER_OVERLAY_DEFAULTS, ...preserved };
}

const ARTWORK_SOURCES: PosterArtworkSource[] = [
  "auto",
  "tmdb",
  "fanart",
  "tvdb",
  "metahub",
  "anilist",
  "kitsu",
  "mal",
];

function parseArtworkSource(raw: string | null): PosterArtworkSource {
  const s = (raw ?? "").trim().toLowerCase();
  if (s === "auto") return "tmdb";
  if (ARTWORK_SOURCES.includes(s as PosterArtworkSource)) {
    return s as PosterArtworkSource;
  }
  return POSTER_OVERLAY_DEFAULTS.artwork;
}

const ARTWORK_MOVIE_SOURCES: PosterArtworkMovieSource[] = [
  "auto",
  "tmdb",
  "fanart",
  "metahub",
  "anilist",
  "kitsu",
  "mal",
];

function parseArtworkMovie(raw: string | null): PosterArtworkMovieSource {
  const s = (raw ?? "").trim().toLowerCase();
  if (s === "auto") return "tmdb";
  if (ARTWORK_MOVIE_SOURCES.includes(s as PosterArtworkMovieSource)) {
    return s as PosterArtworkMovieSource;
  }
  return POSTER_OVERLAY_DEFAULTS.artworkMovie;
}

const ARTWORK_FALLBACKS: PosterArtworkFallback[] = ["metahub", "tmdb", "fanart", "tvdb"];

function parseArtworkFallback(raw: string | null): PosterArtworkFallback {
  const s = (raw ?? "").trim().toLowerCase();
  if (ARTWORK_FALLBACKS.includes(s as PosterArtworkFallback)) {
    return s as PosterArtworkFallback;
  }
  return "metahub";
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function parseGenreMode(raw: string | null): GenreMode {
  return raw === "top3" ? "top3" : "first";
}

function parseRatingStyle(raw: string | null): RatingStyle {
  if (raw === "min" || raw === "votes" || raw === "score") return raw;
  if (raw === "ten") return "score";
  return POSTER_OVERLAY_DEFAULTS.ratingStyle;
}

function parseLayout(raw: string | null): OverlayLayout {
  return raw === "row" ? "row" : "stack";
}

const LEGACY_ANCHOR_TO_GRID: Record<string, GridCell> = {
  tl: 0,
  tc: 1,
  tr: 2,
  ml: 3,
  mc: 4,
  mr: 5,
  bl: 6,
  bc: 7,
  br: 8,
};

function parseGridCell(searchParams: URLSearchParams): GridCell {
  const g = searchParams.get("grid");
  if (g != null && g !== "") {
    const n = Number(g);
    if (Number.isInteger(n) && n >= 0 && n <= 8) {
      return n as GridCell;
    }
  }
  const a = searchParams.get("anchor")?.toLowerCase().trim();
  if (a && a in LEGACY_ANCHOR_TO_GRID) {
    return LEGACY_ANCHOR_TO_GRID[a];
  }
  return POSTER_OVERLAY_DEFAULTS.gridCell;
}

export function syncFooterPadsWhenBothEnabled(
  overlay: PosterOverlayQuery,
): PosterOverlayQuery {
  if (!overlay.genre || !overlay.rating) return overlay;
  const pad = Math.max(overlay.padY, overlay.ratingPadY);
  if (overlay.padY === pad && overlay.ratingPadY === pad) return overlay;
  return { ...overlay, padY: pad, ratingPadY: pad };
}

export function parseColorParam(raw: string | null, fallback: string): string {
  if (!raw) return fallback;
  const s = raw.trim().toLowerCase();
  if (s === "auto") return "auto";
  const hex = s.replace(/^#/, "");
  if (/^[0-9a-f]{6}$/.test(hex)) {
    return `#${hex}`;
  }
  return fallback;
}

export function serializeColorParam(value: string): string {
  if (value === "auto") return "auto";
  return value.replace(/^#/, "");
}

export function parsePosterOverlayQuery(searchParams: URLSearchParams): PosterOverlayQuery {
  const d = POSTER_OVERLAY_DEFAULTS;
  const legacyFontRaw = clamp(Number(searchParams.get("font") ?? NaN), 16, 56);
  const legacyFont = Number.isFinite(legacyFontRaw) ? legacyFontRaw : null;
  const padX = clamp(Number(searchParams.get("pad_x") ?? NaN), 8, 120);
  const padY = clamp(Number(searchParams.get("pad_y") ?? NaN), FOOTER_PAD_Y_MIN, FOOTER_PAD_Y_MAX);
  const ratingPadY = clamp(
    Number(searchParams.get("rating_pad_y") ?? NaN),
    FOOTER_PAD_Y_MIN,
    FOOTER_PAD_Y_MAX,
  );
  const lineGap = clamp(Number(searchParams.get("line_gap") ?? NaN), 4, 36);
  const trendRankRaw = clamp(Number(searchParams.get("trend_rank") ?? NaN), 1, 10);
  const trendRank = Number.isFinite(trendRankRaw) ? trendRankRaw : null;

  const parsed: PosterOverlayQuery = {
    genre: searchParams.get("genre") !== "0",
    rating: searchParams.get("rating") !== "0",
    trendTags: searchParams.has("trend")
      ? searchParams.get("trend") !== "0"
      : d.trendTags,
    qualityTags: searchParams.get("quality") === "1",
    ageRating: searchParams.get("age") === "1",
    logoOnPoster: searchParams.has("logo")
      ? searchParams.get("logo") !== "0"
      : d.logoOnPoster,
    ratingSource: searchParams.has("rating_src")
      ? parseRatingSource(searchParams.get("rating_src"))
      : d.ratingSource,
    artwork: parseArtworkSource(searchParams.get("artwork")),
    artworkMovie: parseArtworkMovie(searchParams.get("artwork_movie")),
    artworkFallback: parseArtworkFallback(searchParams.get("artwork_fb")),
    genreMode: parseGenreMode(searchParams.get("genre_mode")),
    ratingStyle: parseRatingStyle(searchParams.get("rating_style")),
    ratingColors: searchParams.get("rating_colors") === "1",
    layout: parseLayout(searchParams.get("layout")),
    gridCell: parseGridCell(searchParams),
    genreColor: parseColorParam(searchParams.get("genre_color"), d.genreColor),
    ratingColor: parseColorParam(searchParams.get("rating_color"), d.ratingColor),
    genreFontSize: parseFontParam(searchParams, "genre_font", legacyFont, d.genreFontSize),
    ratingFontSize: parseFontParam(searchParams, "rating_font", legacyFont, d.ratingFontSize),
    trendFontSize: parseFontParam(searchParams, "trend_font", null, d.trendFontSize),
    qualityMarkSize: parseFontParam(searchParams, "mark_font", null, d.qualityMarkSize),
    padX: Number.isFinite(padX) ? padX : d.padX,
    padY: Number.isFinite(padY) ? padY : d.padY,
    ratingPadY: Number.isFinite(ratingPadY) ? ratingPadY : d.ratingPadY,
    lineGap: Number.isFinite(lineGap) ? lineGap : d.lineGap,
    trendRank,
  };
  return syncFooterPadsWhenBothEnabled(parsed);
}

export function resolveFooterPadBottom(
  overlay: Pick<PosterOverlayQuery, "genre" | "rating" | "padY" | "ratingPadY">,
  canvasH: number,
): number {
  const floor = Math.round(canvasH * 0.022);
  const pads: number[] = [];
  if (overlay.genre) pads.push(overlay.padY);
  if (overlay.rating) pads.push(overlay.ratingPadY);
  if (pads.length === 0) return floor;
  return Math.max(...pads, floor);
}

export function serializePosterQuery(opts: PosterOverlayQuery): string {
  const synced = syncFooterPadsWhenBothEnabled(opts);
  const p = new URLSearchParams();
  p.set("genre", synced.genre ? "1" : "0");
  p.set("rating", synced.rating ? "1" : "0");
  p.set("trend", synced.trendTags ? "1" : "0");
  p.set("quality", synced.qualityTags ? "1" : "0");
  p.set("age", synced.ageRating ? "1" : "0");
  p.set("logo", synced.logoOnPoster ? "1" : "0");
  p.set("rating_src", synced.ratingSource);
  p.set("artwork", synced.artwork);
  if (synced.artwork === "tvdb") {
    p.set("artwork_movie", synced.artworkMovie);
  }
  p.set("artwork_fb", synced.artworkFallback);
  p.set("genre_mode", synced.genreMode);
  p.set("rating_style", synced.ratingStyle);
  p.set("rating_colors", synced.ratingColors ? "1" : "0");
  p.set("layout", synced.layout);
  p.set("grid", String(synced.gridCell));
  p.set("genre_color", serializeColorParam(synced.genreColor));
  p.set("rating_color", serializeColorParam(synced.ratingColor));
  p.set("genre_font", String(synced.genreFontSize));
  p.set("rating_font", String(synced.ratingFontSize));
  p.set("font", String(synced.ratingFontSize));
  p.set("trend_font", String(synced.trendFontSize));
  p.set("mark_font", String(synced.qualityMarkSize));
  p.set("pad_x", String(synced.padX));
  p.set("pad_y", String(synced.padY));
  p.set("rating_pad_y", String(synced.ratingPadY));
  p.set("line_gap", String(synced.lineGap));
  if (synced.trendRank != null) {
    p.set("trend_rank", String(synced.trendRank));
  }
  return p.toString();
}

export function defaultPosterQueryString(): string {
  const raw = process.env.POLIS_POSTER_QUERY?.trim();
  if (!raw) return serializePosterQuery(POSTER_OVERLAY_DEFAULTS);
  const merged = parsePosterOverlayQuery(new URLSearchParams(raw));
  return serializePosterQuery(merged);
}

export function configureInitialPosterOverlay(
  overrides?: Partial<
    Pick<PosterOverlayQuery, "artwork" | "artworkMovie" | "artworkFallback">
  >,
): PosterOverlayQuery {
  return { ...POSTER_OVERLAY_DEFAULTS, ...overrides };
}

export function showcasePosterOverlay(base?: PosterOverlayQuery): PosterOverlayQuery {
  const b = base ?? POSTER_OVERLAY_DEFAULTS;
  return {
    ...b,
    logoOnPoster: false,
    trendTags: true,
    qualityTags: false,
    ageRating: false,
  };
}

export function showcasePosterQueryString(base?: PosterOverlayQuery): string {
  return serializePosterQuery(showcasePosterOverlay(base));
}
