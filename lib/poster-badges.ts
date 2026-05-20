import type { MdblistMediaInfo } from "@/lib/mdblist-client";
import {
  normalizeQualityMarkIds,
  qualityMarkIdsFromFlags,
  type QualityFlags,
  type QualityMarkId,
} from "@/lib/poster-quality-marks";
import type { ResolvedTitle } from "@/lib/tmdb-resolve";

export type PosterPillBadge = {
  text: string;
  kind: "trend" | "quality" | "age";
};

export type { QualityMarkId, QualityFlags };

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const NEW_MOVIE_DAYS = 45;
const NEW_EPISODE_DAYS = 14;

type TrendCandidate = { text: string; priority: number };

function slugKeyword(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_]+/g, "-");
}

function hasKeywordExact(keywords: string[], ...slugs: string[]): boolean {
  const set = new Set(keywords.map(slugKeyword));
  return slugs.some((slug) => set.has(slugKeyword(slug)));
}

function parseReleaseMs(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const ms = Date.parse(`${raw.slice(0, 10)}T00:00:00Z`);
  return Number.isFinite(ms) ? ms : null;
}

function daysSince(ms: number): number {
  return (Date.now() - ms) / MS_PER_DAY;
}

function normalizeStatus(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  return raw.trim().toLowerCase();
}

function isReturningSeriesStatus(status: string | null): boolean {
  return status === "returning series" || status === "in production";
}

function parseQualityFlagsFromFilename(filename: string) {
  const n = filename.toUpperCase();
  const has4k = /\b2160P\b|\b4K\b|\bUHD\b/.test(n);
  return {
    has4k,
    has1080p: !has4k && /\b1080P\b/.test(n),
    has720p: !has4k && !/\b1080P\b/.test(n) && /\b720P\b/.test(n),
    hasDolbyVision: /\bDOVI\b|\bDV\b|DOLBY\s*VISION/.test(n),
    hasDolbyAtmos: /\bATMOS\b|DOLBY\s*ATMOS/.test(n),
    hasHdr: /\bHDR10\+?\b|\bHDR\b|\bHLG\b/.test(n),
  };
}

export function collectQualityFlags(mdblist: MdblistMediaInfo): QualityFlags {
  const flags: QualityFlags = {
    has4k: false,
    has1080p: false,
    has720p: false,
    hasDolbyVision: false,
    hasDolbyAtmos: false,
    hasHdr: false,
  };

  for (const name of mdblist.filenames) {
    const parsed = parseQualityFlagsFromFilename(name);
    flags.has4k ||= parsed.has4k;
    flags.has1080p ||= parsed.has1080p;
    flags.has720p ||= parsed.has720p;
    flags.hasDolbyVision ||= parsed.hasDolbyVision;
    flags.hasDolbyAtmos ||= parsed.hasDolbyAtmos;
    flags.hasHdr ||= parsed.hasHdr;
  }

  const keywords = mdblist.keywordNames;
  if (hasKeywordExact(keywords, "4k-blu-ray", "4k", "4k-ultra-hd")) {
    flags.has4k = true;
  }
  if (hasKeywordExact(keywords, "dolby-vision", "dolby-vision-cp")) {
    flags.hasDolbyVision = true;
  }
  if (hasKeywordExact(keywords, "dolby-atmos")) {
    flags.hasDolbyAtmos = true;
  }
  if (
    hasKeywordExact(
      keywords,
      "hdr",
      "hdr10",
      "hdr10-plus",
      "hdr-10",
      "hdr-10-plus",
      "hdr10plus",
      "high-dynamic-range",
      "hlg",
    )
  ) {
    flags.hasHdr = true;
  }

  return flags;
}

export function buildQualityMarkIds(mdblist: MdblistMediaInfo | null): QualityMarkId[] {
  if (!mdblist) return [];
  return normalizeQualityMarkIds(qualityMarkIdsFromFlags(collectQualityFlags(mdblist)));
}

function trendRankLabel(rank: number): string {
  return rank === 1 ? "#1 Trending" : `#${rank} Trending`;
}

function collectTrendCandidates(params: {
  resolved: ResolvedTitle;
  mdblist: MdblistMediaInfo | null;
  trendRank?: number | null;
}): TrendCandidate[] {
  const candidates: TrendCandidate[] = [];
  const mdblistKeywords = params.mdblist?.keywordNames ?? [];
  const keywords = mdblistKeywords;

  const status = normalizeStatus(params.resolved.status ?? params.mdblist?.status ?? null);
  const isSeries = params.resolved.stremioType === "series";

  const releaseMs =
    parseReleaseMs(params.mdblist?.releaseDate ?? null) ??
    parseReleaseMs(params.resolved.releasedIso) ??
    parseReleaseMs(params.resolved.releaseYear ? `${params.resolved.releaseYear}-06-01` : null);

  const lastAirMs = parseReleaseMs(params.resolved.lastAirDateIso);

  if (params.trendRank != null && params.trendRank >= 1 && params.trendRank <= 10) {
    candidates.push({
      text: trendRankLabel(params.trendRank),
      priority: 96 - params.trendRank,
    });
  }

  if (isSeries && isReturningSeriesStatus(status) && lastAirMs != null) {
    const episodeAge = daysSince(lastAirMs);
    if (episodeAge >= 0 && episodeAge <= NEW_EPISODE_DAYS) {
      candidates.push({ text: "New Episode", priority: 94 });
    }
  }

  if (isSeries && isReturningSeriesStatus(status)) {
    candidates.push({ text: "Returning Series", priority: 86 });
  }

  if (releaseMs != null) {
    const ageDays = daysSince(releaseMs);
    if (ageDays >= 0 && ageDays <= NEW_MOVIE_DAYS) {
      candidates.push({
        text: isSeries ? "New Series" : "New Release",
        priority: isSeries ? 78 : 76,
      });
    }
  }

  if (
    hasKeywordExact(keywords, "oscar-winner", "best-picture-winner") ||
    hasKeywordExact(keywords, "national-film-preservation-board-winner")
  ) {
    candidates.push({ text: "Oscar Winner", priority: 100 });
  } else if (
    hasKeywordExact(
      keywords,
      "oscar-nominated",
      "best-picture-nominated",
      "oscar-best-director-nominee",
    )
  ) {
    candidates.push({ text: "Oscar Nominee", priority: 88 });
  }

  if (hasKeywordExact(keywords, "emmy-award-winner")) {
    candidates.push({ text: "Emmy Winner", priority: 98 });
  } else if (hasKeywordExact(keywords, "emmy-award-nominated")) {
    candidates.push({ text: "Emmy Nominee", priority: 84 });
  }

  if (hasKeywordExact(keywords, "golden-globe-winner")) {
    candidates.push({ text: "Golden Globe Winner", priority: 92 });
  } else if (hasKeywordExact(keywords, "golden-globe-nominated")) {
    candidates.push({ text: "Golden Globe Nominee", priority: 82 });
  }

  if (hasKeywordExact(keywords, "festival-cannes-winner")) {
    candidates.push({ text: "Cannes Winner", priority: 90 });
  } else if (hasKeywordExact(keywords, "festival-sundance-winner")) {
    candidates.push({ text: "Sundance Winner", priority: 89 });
  } else if (hasKeywordExact(keywords, "festival-venice-winner")) {
    candidates.push({ text: "Venice Winner", priority: 89 });
  } else if (hasKeywordExact(keywords, "festival-toronto-winner")) {
    candidates.push({ text: "Toronto Winner", priority: 88 });
  } else if (hasKeywordExact(keywords, "festival-berlin-winner")) {
    candidates.push({ text: "Berlin Winner", priority: 88 });
  }

  if (hasKeywordExact(keywords, "certified-hot")) {
    candidates.push({ text: "Certified Hot", priority: 72 });
  }

  if (hasKeywordExact(keywords, "metacritic-must-see")) {
    candidates.push({ text: "Must See", priority: 70 });
  }

  if (hasKeywordExact(keywords, "first-in-collection")) {
    candidates.push({ text: "First in Series", priority: 68 });
  } else if (hasKeywordExact(keywords, "collection-follow-up")) {
    candidates.push({ text: "Franchise Entry", priority: 62 });
  }

  if (hasKeywordExact(keywords, "imdb-tv-mini-series")) {
    candidates.push({ text: "Limited Series", priority: 74 });
  }

  if (hasKeywordExact(keywords, "cult-film", "cult-tv")) {
    candidates.push({ text: "Cult Classic", priority: 66 });
  }

  if (hasKeywordExact(keywords, "christmas-movie")) {
    candidates.push({ text: "Holiday Pick", priority: 58 });
  }

  if (hasKeywordExact(keywords, "certified-fresh")) {
    candidates.push({ text: "Certified Fresh", priority: 50 });
  } else if (hasKeywordExact(keywords, "fresh")) {
    candidates.push({ text: "Fresh", priority: 48 });
  }

  const vote = params.resolved.voteAverage;
  const votes = params.resolved.voteCount;
  if (vote != null && votes != null && vote >= 8 && votes >= 500) {
    candidates.push({ text: "Top Rated", priority: 60 });
  }

  return candidates;
}

export function pickBestTrendBadge(params: {
  resolved: ResolvedTitle;
  mdblist: MdblistMediaInfo | null;
  trendRank?: number | null;
}): PosterPillBadge | null {
  const candidates = collectTrendCandidates(params);
  if (candidates.length === 0) return null;
  const best = candidates.reduce((a, b) => (b.priority > a.priority ? b : a));
  return { text: best.text, kind: "trend" };
}

export function buildTrendBadges(params: {
  resolved: ResolvedTitle;
  mdblist: MdblistMediaInfo | null;
  trendRank?: number | null;
}): PosterPillBadge[] {
  const badge = pickBestTrendBadge(params);
  return badge ? [badge] : [];
}

export function buildAgeBadge(
  mdblist: MdblistMediaInfo | null,
  certification: string | null,
): PosterPillBadge | null {
  const label = mdblist?.certification ?? certification;
  if (!label?.trim()) return null;
  return { text: label.trim(), kind: "age" };
}

export function appendTrendRankToPosterQuery(baseQuery: string, rank: number | null): string {
  if (rank == null || rank < 1 || rank > 10) return baseQuery;
  const params = new URLSearchParams(baseQuery);
  params.set("trend_rank", String(rank));
  return params.toString();
}
