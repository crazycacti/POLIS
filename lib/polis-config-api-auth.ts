import {
  createConfigureSessionToken,
  parseConfigureSessionCookie,
  verifyConfigPassword,
  verifyConfigureSessionToken,
} from "@/lib/polis-config-auth";
import { getConfigPasswordHash, getPolisConfig } from "@/lib/polis-config-store";
import {
  clearPasswordFailures,
  passwordAttemptRetryAfterSeconds,
  recordPasswordFailure,
} from "@/lib/polis-password-attempts";

export const TOO_MANY_PASSWORD_ATTEMPTS = "Too many attempts. Try again later.";

export type PasswordCheckResult =
  | { ok: true }
  | { ok: false; status: 401; error: string }
  | { ok: false; status: 429; error: string; retryAfterSeconds: number };

export async function checkConfigPassword(
  configId: string,
  password: string,
): Promise<PasswordCheckResult> {
  const retryAfterSeconds = passwordAttemptRetryAfterSeconds(configId);
  if (retryAfterSeconds != null) {
    return { ok: false, status: 429, error: TOO_MANY_PASSWORD_ATTEMPTS, retryAfterSeconds };
  }
  // Count the attempt before the slow verify so parallel guesses cannot all pass the check.
  recordPasswordFailure(configId);
  const valid = await verifyConfigPassword(password, getConfigPasswordHash(configId));
  if (!valid) {
    return { ok: false, status: 401, error: "Invalid password." };
  }
  clearPasswordFailures(configId);
  return { ok: true };
}

export function issueConfigureSessionToken(configId: string): string {
  return createConfigureSessionToken(configId, getConfigPasswordHash(configId));
}

export function isConfigureSessionValid(request: Request, configId: string): boolean {
  const parsed = parseConfigureSessionCookie(request.headers.get("cookie"));
  if (!parsed || parsed.configId !== configId) return false;
  return verifyConfigureSessionToken(parsed.token, configId, getConfigPasswordHash(configId));
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
    const check = await checkConfigPassword(configId, password.trim());
    if (check.ok) {
      return { ok: true, sessionToken: issueConfigureSessionToken(configId) };
    }
    return { ok: false, status: check.status, error: check.error };
  }

  return { ok: false, status: 401, error: "Password or active configure session required." };
}
