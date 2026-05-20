import { collectMdblistRatings, type RatingScores } from "@/lib/ratings";
import { fetchUpstream } from "@/lib/upstream-fetch";

export type MdblistMediaInfo = {
  ratings: RatingScores;
  releaseDate: string | null;
  status: string | null;
  keywordNames: string[];
  certification: string | null;
  filenames: string[];
};

function slugKeyword(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_]+/g, "-");
}

function keywordNamesFromPayload(payload: Record<string, unknown>): string[] {
  const out = new Set<string>();
  const add = (value: unknown) => {
    if (typeof value === "string" && value.trim()) {
      out.add(slugKeyword(value));
    }
  };

  for (const key of ["keywords", "keyword", "tags"]) {
    const raw = payload[key];
    if (!Array.isArray(raw)) continue;
    for (const entry of raw) {
      if (typeof entry === "string") {
        add(entry);
        continue;
      }
      if (!entry || typeof entry !== "object") continue;
      const row = entry as Record<string, unknown>;
      add(row.name);
      add(row.keyword);
      add(row.slug);
      add(row.value);
    }
  }

  return [...out];
}

function filenamesFromPayload(payload: Record<string, unknown>): string[] {
  const names: string[] = [];
  const pushName = (value: unknown) => {
    if (typeof value === "string" && value.trim()) {
      names.push(value.trim());
    }
  };

  const releases = payload.releases;
  if (Array.isArray(releases)) {
    for (const release of releases) {
      if (!release || typeof release !== "object") continue;
      const row = release as Record<string, unknown>;
      pushName(row.filename);
      pushName(row.file_name);
      pushName(row.name);
      const files = row.files;
      if (Array.isArray(files)) {
        for (const file of files) {
          if (typeof file === "string") pushName(file);
          else if (file && typeof file === "object") {
            pushName((file as { filename?: unknown }).filename);
            pushName((file as { name?: unknown }).name);
          }
        }
      }
    }
  }

  const files = payload.files;
  if (Array.isArray(files)) {
    for (const file of files) {
      if (typeof file === "string") pushName(file);
      else if (file && typeof file === "object") {
        pushName((file as { filename?: unknown }).filename);
        pushName((file as { name?: unknown }).name);
      }
    }
  }

  return names;
}

function certificationFromPayload(payload: Record<string, unknown>): string | null {
  const cert = payload.certification ?? payload.age_rating ?? payload.content_rating;
  if (typeof cert === "string" && cert.trim()) return cert.trim();
  if (cert && typeof cert === "object") {
    const label = (cert as { certification?: unknown; rating?: unknown }).certification
      ?? (cert as { rating?: unknown }).rating;
    if (typeof label === "string" && label.trim()) return label.trim();
  }
  return null;
}

function unwrapMdblistRecord(payload: unknown): Record<string, unknown> | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  const nested = record.data ?? record.media ?? record.movie ?? record.show;
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    return nested as Record<string, unknown>;
  }
  return record;
}

function mergeUniqueStrings(a: string[], b: string[]): string[] {
  return [...new Set([...a, ...b].filter(Boolean))];
}

export function parseMdblistMediaInfo(payload: unknown): MdblistMediaInfo | null {
  const record = unwrapMdblistRecord(payload);
  if (!record) return null;

  const releaseDate =
    (typeof record.release_date === "string" && record.release_date) ||
    (typeof record.released === "string" && record.released) ||
    (typeof record.first_air_date === "string" && record.first_air_date) ||
    null;

  const status = typeof record.status === "string" ? record.status : null;

  return {
    ratings: collectMdblistRatings(record),
    releaseDate,
    status,
    keywordNames: keywordNamesFromPayload(record),
    certification: certificationFromPayload(record),
    filenames: filenamesFromPayload(record),
  };
}

async function fetchMdblistLegacyPayload(params: {
  imdbId: string;
  stremioType: "movie" | "series";
  apiKey: string;
}): Promise<unknown | null> {
  const url = new URL("https://mdblist.com/api/");
  url.searchParams.set("apikey", params.apiKey);
  url.searchParams.set("i", params.imdbId);
  url.searchParams.set("m", params.stremioType === "movie" ? "movie" : "show");

  const response = await fetchUpstream(url.toString(), {
    headers: { Accept: "application/json" },
    revalidateSeconds: 3600,
    timeoutMs: 15_000,
  });
  if (!response.ok) return null;
  return response.json();
}

async function fetchMdblistModernPayload(params: {
  imdbId: string;
  stremioType: "movie" | "series";
  apiKey: string;
}): Promise<unknown | null> {
  const mediaType = params.stremioType === "movie" ? "movie" : "show";
  const url = new URL(
    `https://api.mdblist.com/imdb/${mediaType}/${encodeURIComponent(params.imdbId)}`,
  );
  url.searchParams.set("apikey", params.apiKey);

  const response = await fetchUpstream(url, {
    headers: { Accept: "application/json" },
    revalidateSeconds: 3600,
  });
  if (!response.ok) return null;
  return response.json();
}

export function mergeMdblistMediaInfo(
  primary: MdblistMediaInfo | null,
  secondary: MdblistMediaInfo | null,
): MdblistMediaInfo | null {
  if (!primary) return secondary;
  if (!secondary) return primary;

  return {
    ratings: { ...secondary.ratings, ...primary.ratings },
    releaseDate: primary.releaseDate ?? secondary.releaseDate,
    status: primary.status ?? secondary.status,
    keywordNames: mergeUniqueStrings(primary.keywordNames, secondary.keywordNames),
    certification: primary.certification ?? secondary.certification,
    filenames: mergeUniqueStrings(primary.filenames, secondary.filenames),
  };
}

export async function fetchMdblistMediaInfo(params: {
  imdbId: string;
  stremioType: "movie" | "series";
  apiKey: string;
}): Promise<MdblistMediaInfo | null> {
  const modernPayload = await fetchMdblistModernPayload(params);
  const modern = modernPayload ? parseMdblistMediaInfo(modernPayload) : null;
  if (modern) return modern;

  const legacyPayload = await fetchMdblistLegacyPayload({
    imdbId: params.imdbId,
    stremioType: params.stremioType,
    apiKey: params.apiKey,
  });
  return legacyPayload ? parseMdblistMediaInfo(legacyPayload) : null;
}
