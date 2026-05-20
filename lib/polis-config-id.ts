export const RESERVED_CONFIG_SEGMENTS = new Set([
  "api",
  "backdrop",
  "catalog",
  "configure",
  "demo",
  "logo",
  "manifest.full.json",
  "manifest.json",
  "meta",
  "poster",
  "setup",
  "_next",
  "favicon.ico",
]);

const CONFIG_ID_RE = /^[A-Za-z0-9_-]{12,48}$/;

export function generatePolisConfigId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(15));
  let binary = "";
  for (const b of bytes) {
    binary += String.fromCharCode(b);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function isValidPolisConfigId(id: string): boolean {
  if (!CONFIG_ID_RE.test(id)) return false;
  return !RESERVED_CONFIG_SEGMENTS.has(id);
}
