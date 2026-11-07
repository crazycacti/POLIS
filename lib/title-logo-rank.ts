export type TitleLogoEntry = { url: string; language: string | null; score: number };

export function rankTitleLogos(
  entries: readonly TitleLogoEntry[],
  preferredLanguages: readonly (string | null)[],
  neutralLanguages: ReadonlySet<string>,
): string[] {
  const preferred = [...new Set(preferredLanguages.filter((code): code is string => Boolean(code)))];
  const neutralTier = preferred.length;
  const tierOf = (entry: TitleLogoEntry): number | null => {
    const code = entry.language?.trim().toLowerCase() ?? "";
    const index = preferred.indexOf(code);
    if (index >= 0) return index;
    return !code || neutralLanguages.has(code) ? neutralTier : null;
  };
  const ranked = entries.flatMap((entry) => {
    const url = entry.url.trim();
    const tier = tierOf(entry);
    return url && tier != null ? [{ url, tier, score: entry.score }] : [];
  });
  ranked.sort((a, b) => a.tier - b.tier || b.score - a.score);
  return [...new Set(ranked.map((entry) => entry.url))];
}
