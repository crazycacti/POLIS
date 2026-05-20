export type TmdbCreditsBlock = {
  cast?: { name?: string; order?: number }[];
  crew?: { name?: string; job?: string }[];
};

type DetailsWithCredits = {
  credits?: TmdbCreditsBlock;
  aggregate_credits?: TmdbCreditsBlock;
};

const CAST_LIMIT = 10;

export function creditsBlockFromDetails(details: DetailsWithCredits): TmdbCreditsBlock | null {
  const embedded = details.credits;
  if (embedded?.cast?.length || embedded?.crew?.length) return embedded;
  const aggregate = details.aggregate_credits;
  if (aggregate?.cast?.length || aggregate?.crew?.length) return aggregate;
  return embedded ?? aggregate ?? null;
}

export function parseTmdbCredits(
  block: TmdbCreditsBlock | null,
  stremioType: "movie" | "series",
): { cast: string[]; directors: string[] } {
  if (!block) return { cast: [], directors: [] };

  const cast = (block.cast ?? [])
    .filter((c) => c.name?.trim())
    .sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
    .slice(0, CAST_LIMIT)
    .map((c) => c.name!.trim());

  const directorJobs =
    stremioType === "series"
      ? new Set(["Director", "Creator"])
      : new Set(["Director"]);

  const seenDirectors = new Set<string>();
  const directors: string[] = [];
  for (const member of block.crew ?? []) {
    if (!member.name?.trim() || !member.job) continue;
    if (!directorJobs.has(member.job)) continue;
    const name = member.name.trim();
    if (seenDirectors.has(name)) continue;
    seenDirectors.add(name);
    directors.push(name);
    if (directors.length >= 5) break;
  }

  return { cast, directors };
}
