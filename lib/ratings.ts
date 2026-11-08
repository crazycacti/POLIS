export type RatingSource =
  | "average"
  | "tmdb"
  | "imdb"
  | "mdblist"
  | "tomatoes"
  | "tomatoesaudience"
  | "metacritic"
  | "metacriticuser"
  | "trakt"
  | "letterboxd"
  | "rogerebert";

export type RatingScores = Partial<Record<RatingSource, number>>;

const SOURCE_ALIASES: Record<string, RatingSource> = {
  average: "average",
  avg: "average",
  tmdb: "tmdb",
  imdb: "imdb",
  mdblist: "mdblist",
  mdb: "mdblist",
  tomatoes: "tomatoes",
  rotten: "tomatoes",
  rottentomatoes: "tomatoes",
  rt: "tomatoes",
  tomatoesaudience: "tomatoesaudience",
  rtaudience: "tomatoesaudience",
  metacritic: "metacritic",
  mc: "metacritic",
  metacriticuser: "metacriticuser",
  mcuser: "metacriticuser",
  trakt: "trakt",
  letterboxd: "letterboxd",
  lb: "letterboxd",
  rogerebert: "rogerebert",
  ebert: "rogerebert",
};

export function parseRatingSource(raw: string | null): RatingSource {
  const key = (raw ?? "").trim().toLowerCase().replace(/[^a-z]/g, "");
  return SOURCE_ALIASES[key] ?? "average";
}

function parseNumericRating(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const n = Number(trimmed.replace(",", ".").replace("%", ""));
    return Number.isFinite(n) ? n : null;
  }
  if (value && typeof value === "object") {
    const nested = value as { value?: unknown; rating?: unknown; score?: unknown };
    return parseNumericRating(nested.value ?? nested.rating ?? nested.score);
  }
  return null;
}

const PERCENT_SOURCES = new Set<RatingSource>([
  "tomatoes",
  "tomatoesaudience",
  "metacritic",
  "trakt",
  "mdblist",
]);

function clampTen(value: number): number {
  return Math.min(10, Math.max(0, value));
}

export function scoreToTenScale(source: RatingSource, value: number): number {
  if (!Number.isFinite(value)) return value;
  if (PERCENT_SOURCES.has(source)) return clampTen(value / 10);

  switch (source) {
    case "letterboxd":
      return clampTen(value <= 5 ? value * 2 : value / 10);
    case "rogerebert":
      return clampTen(value <= 4 ? value * 2.5 : value / 10);
    default:
      return clampTen(value > 10 ? value / 10 : value);
  }
}

export function collectMdblistRatings(payload: unknown): RatingScores {
  const out: RatingScores = {};
  if (!payload || typeof payload !== "object") return out;
  const record = payload as Record<string, unknown>;

  const items = record.ratings;
  if (Array.isArray(items)) {
    for (const item of items) {
      if (!item || typeof item !== "object") continue;
      const row = item as Record<string, unknown>;
      const sourceRaw = String(row.source ?? row.name ?? row.provider ?? "").trim();
      const sourceKey = sourceRaw.toLowerCase().replace(/[^a-z]/g, "");
      const mapped = SOURCE_ALIASES[sourceKey];
      if (!mapped || mapped === "average") continue;
      const value = parseNumericRating(row.value ?? row.rating);
      if (value != null && value > 0) {
        out[mapped] = scoreToTenScale(mapped, value);
        continue;
      }
      const normalized = parseNumericRating(row.score);
      if (normalized != null && normalized > 0) out[mapped] = clampTen(normalized / 10);
    }
  }

  const direct = parseNumericRating(record.score ?? record.mdblist_score ?? record.mdblist);
  if (direct != null && direct > 0) {
    out.mdblist = scoreToTenScale("mdblist", direct);
  }

  return out;
}

export function mergeRatingScores(
  mdblist: RatingScores,
  tmdbVote: number | null,
): RatingScores {
  const merged: RatingScores = { ...mdblist };
  if (tmdbVote != null && merged.tmdb == null) {
    merged.tmdb = tmdbVote;
  }
  return merged;
}

export function computeAverageScore(scores: RatingScores): number | null {
  const entries = Object.entries(scores).filter(
    ([k, v]) => k !== "average" && typeof v === "number" && Number.isFinite(v),
  ) as [RatingSource, number][];
  if (entries.length === 0) return null;
  const sum = entries.reduce((acc, [, value]) => acc + clampTen(value), 0);
  return sum / entries.length;
}

export function formatRatingLabel(value: number, style: "min" | "score"): string {
  const star = style === "min" ? "★ " : "";
  return `${star}${clampTen(value).toFixed(1)}`;
}

export type ResolvedRatingDisplay = {
  label: string;
  valueTen: number;
  colorSource: RatingSource;
};

export function resolveRatingDisplay(
  source: RatingSource,
  scores: RatingScores,
  tmdbFallback: number | null,
  style: "min" | "score",
): ResolvedRatingDisplay | null {
  if (source === "average") {
    const avg = computeAverageScore(scores);
    if (avg != null) {
      return { label: formatRatingLabel(avg, style), valueTen: clampTen(avg), colorSource: "average" };
    }
    if (tmdbFallback == null) return null;
    return {
      label: formatRatingLabel(tmdbFallback, style),
      valueTen: clampTen(tmdbFallback),
      colorSource: "tmdb",
    };
  }

  const direct = scores[source];
  if (direct != null) {
    return {
      label: formatRatingLabel(direct, style),
      valueTen: clampTen(direct),
      colorSource: source,
    };
  }

  if (source === "tmdb" && tmdbFallback != null) {
    return {
      label: formatRatingLabel(tmdbFallback, style),
      valueTen: clampTen(tmdbFallback),
      colorSource: "tmdb",
    };
  }

  return null;
}

export function pickRatingDisplay(
  source: RatingSource,
  scores: RatingScores,
  tmdbFallback: number | null,
  style: "min" | "score",
): string | null {
  return resolveRatingDisplay(source, scores, tmdbFallback, style)?.label ?? null;
}

export const RATING_BADGE_SOURCES = [
  "imdb",
  "tomatoes",
  "tomatoesaudience",
  "metacritic",
  "letterboxd",
  "trakt",
  "tmdb",
  "mdblist",
] as const satisfies readonly RatingSource[];

export type RatingBadgeSource = (typeof RATING_BADGE_SOURCES)[number];

export const MAX_RATING_BADGES = 3;

const RATING_BADGE_PREFIX: Record<RatingBadgeSource, string> = {
  imdb: "IMDb",
  tomatoes: "RT",
  tomatoesaudience: "RT Audience",
  metacritic: "MC",
  letterboxd: "LB",
  trakt: "Trakt",
  tmdb: "TMDB",
  mdblist: "MDBList",
};

function isRatingBadgeSource(value: string): value is RatingBadgeSource {
  return (RATING_BADGE_SOURCES as readonly string[]).includes(value);
}

export function parseRatingBadgeSources(raw: string | null | undefined): RatingBadgeSource[] {
  const out: RatingBadgeSource[] = [];
  for (const part of (raw ?? "").split(",")) {
    const source = part.trim().toLowerCase();
    if (!isRatingBadgeSource(source) || out.includes(source)) continue;
    out.push(source);
    if (out.length === MAX_RATING_BADGES) break;
  }
  return out;
}

export function ratingBadgeText(source: RatingBadgeSource, valueTen: number): string {
  const value = clampTen(valueTen);
  const prefix = RATING_BADGE_PREFIX[source];
  if (PERCENT_SOURCES.has(source)) {
    const percent = Math.round(value * 10);
    return source === "metacritic" || source === "mdblist" ? `${prefix} ${percent}` : `${prefix} ${percent}%`;
  }
  if (source === "letterboxd") return `${prefix} ${(value / 2).toFixed(1)}`;
  return `${prefix} ${value.toFixed(1)}`;
}

export function buildRatingBadges(sources: RatingBadgeSource[], scores: RatingScores): string[] {
  const out: string[] = [];
  for (const source of sources) {
    const value = scores[source];
    if (value == null || !Number.isFinite(value)) continue;
    out.push(ratingBadgeText(source, value));
  }
  return out;
}

