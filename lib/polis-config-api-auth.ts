import {
  createConfigureSessionToken,
  parseConfigureSessionCookie,
  verifyConfigPassword,
  verifyConfigureSessionToken,
} from "@/lib/polis-config-auth";
import { getConfigPasswordHash, getPolisConfig } from "@/lib/polis-config-store";

export function isConfigureSessionValid(request: Request, configId: string): boolean {
  const parsed = parseConfigureSessionCookie(request.headers.get("cookie"));
  if (!parsed || parsed.configId !== configId) return false;
  return verifyConfigureSessionToken(parsed.token, configId);
}

export async function authorizeConfigWrite(
  request: Request,
  configId: string,
  password?: string | null,
): Promise<{ ok: true; sessionToken?: string } | { ok: false; status: number; error: string }> {
  const config = getPolisConfig(configId);
  if (!config) {
    return { ok: false, status: 404, error: "Config not found" };
  }

  if (!config.hasPassword) {
    return { ok: true };
  }

  if (isConfigureSessionValid(request, configId)) {
    return { ok: true };
  }

  if (typeof password === "string" && password.trim()) {
    const hash = getConfigPasswordHash(configId);
    const valid = await verifyConfigPassword(password.trim(), hash);
    if (valid) {
      return { ok: true, sessionToken: createConfigureSessionToken(configId) };
    }
    return { ok: false, status: 401, error: "Invalid password." };
  }

  return { ok: false, status: 401, error: "Password or active configure session required." };
}
