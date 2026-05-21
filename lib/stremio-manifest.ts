import {
  listPolisCatalogDefinitions,
  polisCatalogsEnabled,
  toStremioManifestCatalog,
  type PolisCatalogDefinition,
} from "@/lib/polis-catalogs";
import { formatPolisManifestName } from "@/lib/polis-config-label";
import { POLIS_ADDON_VERSION } from "@/lib/polis-renderer";
import { normalizePublicBase } from "@/lib/polis-urls";

export type PolisManifestKind = "meta" | "full";

export function resolvePolisManifestKindFromEnv(): PolisManifestKind {
  const raw = process.env.POLIS_MANIFEST_KIND?.trim().toLowerCase();
  if (raw === "full" || raw === "catalog") return "full";
  return "meta";
}

export function buildPolisManifest(
  publicBase: string,
  kind: PolisManifestKind,
  options?: {
    configId?: string;
    catalogs?: PolisCatalogDefinition[];
    label?: string | null;
  },
) {
  const base = normalizePublicBase(publicBase);
  const userCatalogs = options?.catalogs;

  const catalogDefs =
    userCatalogs !== undefined
      ? userCatalogs
      : kind === "full" && polisCatalogsEnabled()
        ? listPolisCatalogDefinitions()
        : [];

  const catalogsActive = catalogDefs.length > 0;
  const resources = catalogsActive
    ? (["catalog", "meta"] as const)
    : (["meta"] as const);

  const description = catalogsActive
    ? "POLIS posters and catalogs from your setup (TMDB and MDBList lists)."
    : "POLIS poster overlays for Stremio. Ratings, trend labels, and quality badges on your art.";

  const defaultId = catalogsActive ? "org.polis.app.full" : "org.polis.app";
  const configId = options?.configId;
  const displayName = configId
    ? formatPolisManifestName(options?.label)
    : catalogsActive
      ? "POLIS"
      : "POLIS Posters";

  return {
    id: configId ? `org.polis.${configId}` : defaultId,
    version: POLIS_ADDON_VERSION,
    name: displayName,
    description,
    resources: [...resources],
    types: ["movie", "series"],
    catalogs: catalogDefs.map(toStremioManifestCatalog),
    idPrefixes: ["tt"],
    behaviorHints: {
      configurable: Boolean(configId),
      configurationRequired: false,
    },
    logo: `${base}/logo.png`,
    background: `${base}/background.svg`,
  };
}
