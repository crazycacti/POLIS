import { createHash } from "node:crypto";

import type { TmdbCredential } from "@/lib/tmdb-auth";
import { formatTvdbCredentials, type TvdbCredentials } from "@/lib/tvdb-credentials";

function hashPart(label: string, value: string | null | undefined): string {
  if (!value?.trim()) return "";
  return `${label}:${createHash("sha256").update(value.trim()).digest("hex").slice(0, 12)}`;
}

export function integratorCacheFingerprint(params: {
  credential: TmdbCredential;
  mdblistApiKey: string | null;
  fanartApiKey: string | null;
  tvdbCredentials: TvdbCredentials | null;
}): string {
  const tmdb =
    params.credential.kind === "bearer"
      ? hashPart("tmdb_b", params.credential.token)
      : hashPart("tmdb_k", params.credential.key);
  const parts = [
    tmdb,
    hashPart("mdb", params.mdblistApiKey),
    hashPart("fan", params.fanartApiKey),
    hashPart(
      "tvdb",
      params.tvdbCredentials ? formatTvdbCredentials(params.tvdbCredentials) : null,
    ),
  ].filter(Boolean);
  return parts.length > 0 ? parts.join("|") : "_";
}
