import { hasMdblistCredential } from "@/lib/overlay-requirements";
import { inferTmdbCredentialParams } from "@/lib/tmdb-credential-infer";

export function hasTmdbCredential(serverKey: boolean, secretInput: string): boolean {
  if (serverKey) return true;
  return Boolean(inferTmdbCredentialParams(secretInput).params);
}

export function hasRequiredSetupKeys(params: {
  hasServerTmdb: boolean;
  tmdbInput: string;
  hasServerMdblist: boolean;
  mdblistInput: string;
}): boolean {
  return (
    hasTmdbCredential(params.hasServerTmdb, params.tmdbInput) &&
    hasMdblistCredential(params.hasServerMdblist, params.mdblistInput)
  );
}
