import path from "node:path";

export function polisCacheRoot(): string {
  const explicit = process.env.POLIS_CACHE_DIR?.trim();
  if (explicit) return path.resolve(explicit);

  const dbPath = process.env.POLIS_DB_PATH?.trim();
  if (dbPath) {
    return path.join(path.dirname(path.resolve(dbPath)), "cache");
  }

  return path.join(process.cwd(), ".cache", "polis");
}

export function polisCacheScope(configId: string | null | undefined): string {
  const id = configId?.trim();
  return id ? `c/${id}` : "g";
}
