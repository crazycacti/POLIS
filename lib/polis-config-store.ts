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
    tmdbIntegratorSecret: row.tmdb_integrator_secret?.trim() || null,
    mdblistIntegratorKey: row.mdblist_integrator_key?.trim() || null,
    hasPassword: Boolean(row.password_hash?.trim()),
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
  return row ? rowToConfig(row) : null;
}

export function createPolisConfig(params: {
  overlay: PosterOverlayQuery;
  manifestKind?: PolisManifestKind;
  catalogs?: PolisCatalogDefinition[];
  integrator?: PolisConfigIntegratorPatch;
  label?: string | null;
  passwordHash: string;
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
         created_at, updated_at
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      label,
      posterQuery,
      manifestKind,
      catalogsJson,
      integrator.tmdb,
      integrator.mdblist,
      params.passwordHash,
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
  const label =
    params.label !== undefined
      ? normalizeConfigLabel(params.label) ?? existing.label
      : existing.label;
  const passwordHash =
    params.passwordHash !== undefined ? params.passwordHash : undefined;

  if (passwordHash !== undefined) {
    getPolisDb()
      .query(
        `UPDATE user_configs
         SET label = ?, poster_query = ?, manifest_kind = ?, catalogs_json = ?,
             tmdb_integrator_secret = ?, mdblist_integrator_key = ?,
             password_hash = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(
        label,
        posterQuery,
        manifestKind,
        catalogsJson,
        integrator.tmdb,
        integrator.mdblist,
        passwordHash,
        now,
        configId,
      );
  } else {
    getPolisDb()
      .query(
        `UPDATE user_configs
         SET label = ?, poster_query = ?, manifest_kind = ?, catalogs_json = ?,
             tmdb_integrator_secret = ?, mdblist_integrator_key = ?,
             updated_at = ?
         WHERE id = ?`,
      )
      .run(
        label,
        posterQuery,
        manifestKind,
        catalogsJson,
        integrator.tmdb,
        integrator.mdblist,
        now,
        configId,
      );
  }
  void purgePolisConfigDiskCache(configId).catch(() => {});
  purgePosterMemoryCacheForConfig(configId);
  return getPolisConfig(configId);
}

export function overlayFromStoredConfig(config: StoredPolisConfig): PosterOverlayQuery {
  return parsePosterOverlayQuery(new URLSearchParams(config.posterQuery));
}
