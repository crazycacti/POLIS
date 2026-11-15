import { getPolisDb } from "@/lib/db";
import { hashConfigPassword } from "@/lib/polis-config-auth";
import { purgePolisConfigDiskCache } from "@/lib/polis-disk-cache";
import { generatePolisConfigId, isValidPolisConfigId } from "@/lib/polis-config-id";
import type { PolisCatalogDefinition } from "@/lib/polis-catalogs";
import {
  parsePolisCatalogDefinitionsFromJson,
  serializePolisCatalogDefinitions,
} from "@/lib/polis-catalogs-json";
import {
  parsePosterOverlayQuery,
  serializePosterQuery,
  type PosterOverlayQuery,
} from "@/lib/poster-query";
import { normalizeConfigLabel } from "@/lib/polis-config-label";
import { purgePosterMemoryCacheForConfig } from "@/lib/poster-render-cache";
import { parseStoredCustomBadges, serializeCustomBadges, type CustomBadge } from "@/lib/custom-badges";
import { hasStoredSecretKey, isSealedSecret, openSecret, sealSecret } from "@/lib/stored-secret";
import type { PolisManifestKind } from "@/lib/stremio-manifest";

export type StoredPolisConfig = {
  id: string;
  label: string | null;
  posterQuery: string;
  manifestKind: PolisManifestKind;
  catalogs: PolisCatalogDefinition[];
  tmdbIntegratorSecret: string | null;
  mdblistIntegratorKey: string | null;
  hasPassword: boolean;
  customBadges: CustomBadge[];
  createdAt: number;
  updatedAt: number;
};

export type PolisConfigIntegratorPatch = {
  tmdbSecret?: string | null;
  mdblistApiKey?: string | null;
};

type Row = {
  id: string;
  label: string | null;
  poster_query: string;
  manifest_kind: string;
  catalogs_json: string;
  tmdb_integrator_secret: string | null;
  mdblist_integrator_key: string | null;
  password_hash: string | null;
  custom_badges_json: string | null;
  created_at: number;
  updated_at: number;
};

function normalizeIntegratorSecret(value: string | null | undefined): string | null {
  if (value === undefined) return null;
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function applyIntegratorPatch(
  existing: { tmdb: string | null; mdblist: string | null },
  patch: PolisConfigIntegratorPatch | undefined,
): { tmdb: string | null; mdblist: string | null } {
  if (!patch) return existing;
  return {
    tmdb: patch.tmdbSecret !== undefined ? normalizeIntegratorSecret(patch.tmdbSecret) : existing.tmdb,
    mdblist:
      patch.mdblistApiKey !== undefined
        ? normalizeIntegratorSecret(patch.mdblistApiKey)
        : existing.mdblist,
  };
}

function manifestKindFromCatalogs(catalogs: PolisCatalogDefinition[]): PolisManifestKind {
  return catalogs.length > 0 ? "full" : "meta";
}

function rowToConfig(row: Row): StoredPolisConfig {
  const catalogs = parsePolisCatalogDefinitionsFromJson(row.catalogs_json);
  const storedKind = row.manifest_kind === "full" ? "full" : "meta";
  const manifestKind = catalogs.length > 0 ? "full" : storedKind;
  return {
    id: row.id,
    label: normalizeConfigLabel(row.label),
    posterQuery: row.poster_query,
    manifestKind,
    catalogs,
    tmdbIntegratorSecret: openSecret(row.tmdb_integrator_secret?.trim() || null),
    mdblistIntegratorKey: openSecret(row.mdblist_integrator_key?.trim() || null),
    hasPassword: Boolean(row.password_hash?.trim()),
    customBadges: parseStoredCustomBadges(row.custom_badges_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function getConfigPasswordHash(configId: string): string | null {
  if (!isValidPolisConfigId(configId)) return null;
  const row = getPolisDb()
    .query<{ password_hash: string | null }, [string]>(
      "SELECT password_hash FROM user_configs WHERE id = ?",
    )
    .get(configId);
  return row?.password_hash?.trim() || null;
}

export function getPolisConfig(configId: string): StoredPolisConfig | null {
  if (!isValidPolisConfigId(configId)) return null;
  const db = getPolisDb();
  const row = db
    .query<Row, [string]>("SELECT * FROM user_configs WHERE id = ?")
    .get(configId);
  if (!row) return null;
  sealPlaintextKeys(row);
  return rowToConfig(row);
}

function sealPlaintextKeys(row: Row): void {
  const tmdb = row.tmdb_integrator_secret?.trim() || null;
  const mdblist = row.mdblist_integrator_key?.trim() || null;
  const needs = (value: string | null) => value != null && !isSealedSecret(value);
  if ((!needs(tmdb) && !needs(mdblist)) || !hasStoredSecretKey()) return;
  getPolisDb()
    .query(`UPDATE user_configs SET tmdb_integrator_secret = ?, mdblist_integrator_key = ? WHERE id = ?`)
    .run(sealSecret(tmdb), sealSecret(mdblist), row.id);
}

export function createPolisConfig(params: {
  overlay: PosterOverlayQuery;
  manifestKind?: PolisManifestKind;
  catalogs?: PolisCatalogDefinition[];
  integrator?: PolisConfigIntegratorPatch;
  label?: string | null;
  passwordHash: string;
  customBadges?: CustomBadge[];
}): StoredPolisConfig {
  const id = generatePolisConfigId();
  const now = Date.now();
  const posterQuery = serializePosterQuery(params.overlay);
  const catalogs = params.catalogs ?? [];
  const manifestKind = manifestKindFromCatalogs(catalogs);
  const catalogsJson = serializePolisCatalogDefinitions(catalogs);
  const integrator = applyIntegratorPatch({ tmdb: null, mdblist: null }, params.integrator);
  const label = normalizeConfigLabel(params.label);
  getPolisDb()
    .query(
      `INSERT INTO user_configs (
         id, label, poster_query, manifest_kind, catalogs_json,
         tmdb_integrator_secret, mdblist_integrator_key, password_hash,
         custom_badges_json, created_at, updated_at
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      label,
      posterQuery,
      manifestKind,
      catalogsJson,
      sealSecret(integrator.tmdb),
      sealSecret(integrator.mdblist),
      params.passwordHash,
      serializeCustomBadges(params.customBadges ?? []),
      now,
      now,
    );
  return getPolisConfig(id)!;
}

export async function setPolisConfigPassword(
  configId: string,
  password: string,
): Promise<StoredPolisConfig | null> {
  const existing = getPolisConfig(configId);
  if (!existing) return null;
  const passwordHash = await hashConfigPassword(password);
  const now = Date.now();
  getPolisDb()
    .query(`UPDATE user_configs SET password_hash = ?, updated_at = ? WHERE id = ?`)
    .run(passwordHash, now, configId);
  return getPolisConfig(configId);
}

export function updatePolisConfig(
  configId: string,
  params: {
    overlay: PosterOverlayQuery;
    manifestKind?: PolisManifestKind;
    catalogs?: PolisCatalogDefinition[];
    integrator?: PolisConfigIntegratorPatch;
    label?: string | null;
    passwordHash?: string | null;
    customBadges?: CustomBadge[];
  },
): StoredPolisConfig | null {
  const existing = getPolisConfig(configId);
  if (!existing) return null;
  const now = Date.now();
  const posterQuery = serializePosterQuery(params.overlay);
  const catalogs = params.catalogs !== undefined ? params.catalogs : existing.catalogs;
  const manifestKind = manifestKindFromCatalogs(catalogs);
  const catalogsJson = serializePolisCatalogDefinitions(catalogs);
  const integrator = applyIntegratorPatch(
    {
      tmdb: existing.tmdbIntegratorSecret,
      mdblist: existing.mdblistIntegratorKey,
    },
    params.integrator,
  );
  const storedKeys = getPolisDb()
    .query<Pick<Row, "tmdb_integrator_secret" | "mdblist_integrator_key">, [string]>(
      "SELECT tmdb_integrator_secret, mdblist_integrator_key FROM user_configs WHERE id = ?",
    )
    .get(configId);
  // Keys this save does not touch keep their stored bytes, so a key that cannot be decrypted right now is not wiped.
  const tmdbColumn =
    params.integrator?.tmdbSecret !== undefined
      ? sealSecret(integrator.tmdb)
      : (storedKeys?.tmdb_integrator_secret ?? null);
  const mdblistColumn =
    params.integrator?.mdblistApiKey !== undefined
      ? sealSecret(integrator.mdblist)
      : (storedKeys?.mdblist_integrator_key ?? null);
  const label =
    params.label !== undefined
      ? normalizeConfigLabel(params.label) ?? existing.label
      : existing.label;
  const passwordHash =
    params.passwordHash !== undefined ? params.passwordHash : undefined;
  const customBadgesJson = serializeCustomBadges(params.customBadges ?? existing.customBadges);

  if (passwordHash !== undefined) {
    getPolisDb()
      .query(
        `UPDATE user_configs
         SET label = ?, poster_query = ?, manifest_kind = ?, catalogs_json = ?,
             tmdb_integrator_secret = ?, mdblist_integrator_key = ?,
             password_hash = ?, custom_badges_json = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(
        label,
        posterQuery,
        manifestKind,
        catalogsJson,
        tmdbColumn,
        mdblistColumn,
        passwordHash,
        customBadgesJson,
        now,
        configId,
      );
  } else {
    getPolisDb()
      .query(
        `UPDATE user_configs
         SET label = ?, poster_query = ?, manifest_kind = ?, catalogs_json = ?,
             tmdb_integrator_secret = ?, mdblist_integrator_key = ?,
             custom_badges_json = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(
        label,
        posterQuery,
        manifestKind,
        catalogsJson,
        tmdbColumn,
        mdblistColumn,
        customBadgesJson,
        now,
        configId,
      );
  }
  void purgePolisConfigDiskCache(configId).catch(() => {});
  purgePosterMemoryCacheForConfig(configId);
  return getPolisConfig(configId);
}

export function deletePolisConfig(configId: string): boolean {
  if (!isValidPolisConfigId(configId)) return false;
  const result = getPolisDb().query(`DELETE FROM user_configs WHERE id = ?`).run(configId);
  if (result.changes === 0) return false;
  void purgePolisConfigDiskCache(configId).catch(() => {});
  purgePosterMemoryCacheForConfig(configId);
  return true;
}

export function rotatePolisConfigId(configId: string): StoredPolisConfig | null {
  if (!getPolisConfig(configId)) return null;
  const nextId = generatePolisConfigId();
  getPolisDb()
    .query(`UPDATE user_configs SET id = ?, updated_at = ? WHERE id = ?`)
    .run(nextId, Date.now(), configId);
  void purgePolisConfigDiskCache(configId).catch(() => {});
  purgePosterMemoryCacheForConfig(configId);
  return getPolisConfig(nextId);
}

export function overlayFromStoredConfig(config: StoredPolisConfig): PosterOverlayQuery {
  return parsePosterOverlayQuery(new URLSearchParams(config.posterQuery));
}
