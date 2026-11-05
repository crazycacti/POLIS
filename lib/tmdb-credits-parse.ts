export type TmdbCreditsBlock = {
  cast?: {
    name?: string;
    order?: number;
    character?: string;
    profile_path?: string | null;
    roles?: { character?: string }[];
  }[];
  crew?: { name?: string; job?: string }[];
};

export type TmdbCreatedBy = { name?: string }[];

export type TmdbCastMember = {
  name: string;
  character: string | null;
  profilePath: string | null;
};

type DetailsWithCredits = {
  credits?: TmdbCreditsBlock;
  aggregate_credits?: TmdbCreditsBlock;
};

const CAST_LIMIT = 10;
const DIRECTOR_LIMIT = 5;
const TMDB_IMAGE_PATH_RE = /^\/[A-Za-z0-9_-]+\.(?:jpg|jpeg|png|webp)$/i;

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
  createdBy: TmdbCreatedBy = [],
): { cast: string[]; castMembers: TmdbCastMember[]; directors: string[] } {
  const directors: string[] = [];
  const seenDirectors = new Set<string>();
  const addDirector = (raw: string | undefined) => {
    const name = raw?.trim();
    if (!name || seenDirectors.has(name) || directors.length >= DIRECTOR_LIMIT) return;
    seenDirectors.add(name);
    directors.push(name);
  };

  if (stremioType === "series") {
    for (const creator of createdBy) addDirector(creator.name);
  }

  if (!block) return { cast: [], castMembers: [], directors };

  const castMembers = (block.cast ?? [])
    .filter((c) => c.name?.trim())
    .sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
    .slice(0, CAST_LIMIT)
    .map((c) => {
      const character = (c.character ?? c.roles?.[0]?.character)?.trim();
      const profilePath = c.profile_path?.trim();
      return {
        name: c.name!.trim(),
        character: character || null,
        profilePath: profilePath && TMDB_IMAGE_PATH_RE.test(profilePath) ? profilePath : null,
      };
    });
  const cast = castMembers.map((member) => member.name);

  for (const member of block.crew ?? []) {
    if (member.job === "Director") addDirector(member.name);
  }

  return { cast, castMembers, directors };
}
