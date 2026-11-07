export type TmdbCredential =
  | { kind: "bearer"; token: string }
  | { kind: "api_key"; key: string };

export function serverTmdbCredential(): TmdbCredential | null {
  const envApiKey = process.env.TMDB_API_KEY?.trim();
  if (envApiKey) return { kind: "api_key", key: envApiKey };
  const envBearer = process.env.TMDB_ACCESS_TOKEN?.trim();
  if (envBearer) return { kind: "bearer", token: envBearer };
  return null;
}
