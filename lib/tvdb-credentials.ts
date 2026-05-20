export type TvdbCredentials = {
  apiKey: string;
  pin?: string;
};

export function parseTvdbCredentials(raw: string): TvdbCredentials | null {
  const s = raw.trim();
  if (!s) return null;

  const pipe = s.indexOf("|");
  if (pipe > 0) {
    const apiKey = s.slice(0, pipe).trim();
    const pin = s.slice(pipe + 1).trim();
    if (apiKey.length >= 8 && pin.length >= 4) {
      return { apiKey, pin };
    }
    return null;
  }

  const colon = s.indexOf(":");
  if (colon > 0) {
    const apiKey = s.slice(0, colon).trim();
    const pin = s.slice(colon + 1).trim();
    if (apiKey.length >= 8 && pin.length >= 4) {
      return { apiKey, pin };
    }
    return null;
  }

  if (s.length < 8) return null;
  return { apiKey: s };
}

export function formatTvdbCredentials(creds: TvdbCredentials): string {
  return creds.pin ? `${creds.apiKey}|${creds.pin}` : creds.apiKey;
}
