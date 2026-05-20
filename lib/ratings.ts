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

export function scoreToTenScale(source: RatingSource, value: number): number {
  if (!Number.isFinite(value)) return value;

  switch (source) {
    case "letterboxd":
      if (value <= 5) return value * 2;
      return value > 10 ? value / 10 : value;
    case "rogerebert":
      if (value <= 4) return value * 2.5;
      return value > 10 ? value / 10 : value;
    default:
      return value > 10 ? value / 10 : value;
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
      const value = parseNumericRating(row.value ?? row.rating ?? row.score);
      if (value == null || value < 0) continue;
      out[mapped] = scoreToTenScale(mapped, value);
    }
  }

  const direct = parseNumericRating(record.score ?? record.mdblist_score ?? record.mdblist);
  if (direct != null && direct >= 0) {
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
  const sum = entries.reduce((acc, [source, value]) => acc + scoreToTenScale(source, value), 0);
  return sum / entries.length;
}

export function formatRatingLabel(source: RatingSource, value: number, style: "min" | "score"): string {
  const star = style === "min" ? "★ " : "";
  const ten = scoreToTenScale(source, value);
  return `${star}${ten.toFixed(1)}`;
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
      return { label: formatRatingLabel("tmdb", avg, style), valueTen: scoreToTenScale("tmdb", avg), colorSource: "average" };
    }
    if (tmdbFallback == null) return null;
    return {
      label: formatRatingLabel("tmdb", tmdbFallback, style),
      valueTen: scoreToTenScale("tmdb", tmdbFallback),
      colorSource: "tmdb",
    };
  }

  const direct = scores[source];
  if (direct != null) {
    return {
      label: formatRatingLabel(source, direct, style),
      valueTen: scoreToTenScale(source, direct),
      colorSource: source,
    };
  }

  if (source === "tmdb" && tmdbFallback != null) {
    return {
      label: formatRatingLabel("tmdb", tmdbFallback, style),
      valueTen: scoreToTenScale("tmdb", tmdbFallback),
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
