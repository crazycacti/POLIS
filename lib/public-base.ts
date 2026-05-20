import { normalizePublicBase } from "@/lib/polis-urls";

export function polisPublicBaseFromEnv(): string {
  return process.env.POLIS_PUBLIC_URL?.trim().replace(/\/$/, "") ?? "";
}

export function polisPublicBaseFromRequest(request: Request): string {
  const fromEnv = polisPublicBaseFromEnv();
  if (fromEnv) return normalizePublicBase(fromEnv);
  const url = new URL(request.url);
  return normalizePublicBase(`${url.protocol}//${url.host}`);
}
