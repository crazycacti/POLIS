import { normalizePublicBase } from "@/lib/polis-urls";

export const STREMIO_MANIFEST_PATH = "/manifest.json";
export const POLIS_CONFIGURE_PATH = "/configure";

export function configStremioManifestPath(configId: string): string {
  return `/${configId}${STREMIO_MANIFEST_PATH}`;
}

export function configConfigurePath(configId: string): string {
  return `/${configId}${POLIS_CONFIGURE_PATH}`;
}

export function stremioUserInstallUrl(publicBase: string, configId: string): string {
  return `${normalizePublicBase(publicBase)}${configStremioManifestPath(configId)}`;
}

export function polisConfigureUrl(publicBase: string, configId: string): string {
  return `${normalizePublicBase(publicBase)}${configConfigurePath(configId)}`;
}

export function stremioInstallUrls(publicBase: string, configId: string) {
  const transport = stremioUserInstallUrl(publicBase, configId);
  const configure = polisConfigureUrl(publicBase, configId);
  return { transport, configure };
}

export function stremioLegacyInstallUrl(publicBase: string): string {
  return `${normalizePublicBase(publicBase)}${STREMIO_MANIFEST_PATH}`;
}
