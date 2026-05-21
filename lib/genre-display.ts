const GENRE_DISPLAY_ALIASES: Record<string, string> = {
  "science fiction": "Sci-Fi",
  "sci-fi & fantasy": "Sci-Fi",
};

export function formatGenreDisplayName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return trimmed;

  const alias = GENRE_DISPLAY_ALIASES[trimmed.toLowerCase()];
  if (alias) return alias;

  const parts = trimmed.split(/\s+&\s+/);
  if (parts.length > 1) {
    const first = parts[0]?.trim();
    if (first) return first;
  }

  return trimmed;
}
