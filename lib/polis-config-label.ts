const MAX_LABEL_LEN = 32;
const LABEL_RE = /^[\p{L}\p{N}][\p{L}\p{N} '\-_.]*$/u;

export function normalizeConfigLabel(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim() ?? "";
  if (!trimmed) return null;
  const collapsed = trimmed.replace(/\s+/g, " ").slice(0, MAX_LABEL_LEN);
  if (!LABEL_RE.test(collapsed)) return null;
  return collapsed;
}

export function isValidConfigLabel(raw: string | null | undefined): boolean {
  return normalizeConfigLabel(raw) !== null;
}

export function formatPolisManifestName(_label?: string | null): string {
  return "POLIS";
}
