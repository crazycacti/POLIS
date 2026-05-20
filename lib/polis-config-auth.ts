import { createHmac, randomBytes, scrypt, timingSafeEqual } from "node:crypto";

export {
  POLIS_MIN_PASSWORD_LENGTH,
  validateNewPasswordPair,
} from "@/lib/polis-config-auth-constants";

export const POLIS_CONFIGURE_SESSION_COOKIE = "polis_configure_session";
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;

function sessionSecret(): string {
  const fromEnv = process.env.POLIS_SESSION_SECRET?.trim();
  if (fromEnv) return fromEnv;
  if (process.env.NODE_ENV === "production") {
    throw new Error("POLIS_SESSION_SECRET is required in production");
  }
  return "polis-dev-session-secret-change-me";
}

function signPayload(payload: string): string {
  return createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
}

export function createConfigureSessionToken(configId: string): string {
  const exp = Date.now() + SESSION_MS;
  const payload = `${configId}:${exp}`;
  return `${payload}.${signPayload(payload)}`;
}

export function verifyConfigureSessionToken(
  token: string | null | undefined,
  configId: string,
): boolean {
  if (!token?.trim()) return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [payload, sig] = parts;
  if (!payload || !sig) return false;

  const expected = signPayload(payload);
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  } catch {
    return false;
  }

  const [id, expRaw] = payload.split(":");
  if (id !== configId) return false;
  const exp = Number(expRaw);
  if (!Number.isFinite(exp) || exp < Date.now()) return false;
  return true;
}

export function parseConfigureSessionCookie(
  cookieHeader: string | null,
): { configId: string; token: string } | null {
  if (!cookieHeader) return null;
  const prefix = `${POLIS_CONFIGURE_SESSION_COOKIE}=`;
  for (const part of cookieHeader.split(";")) {
    const trimmed = part.trim();
    if (!trimmed.startsWith(prefix)) continue;
    const token = decodeURIComponent(trimmed.slice(prefix.length));
    const payload = token.split(".")[0];
    const configId = payload?.split(":")[0];
    if (!configId) return null;
    return { configId, token };
  }
  return null;
}

export function configureSessionCookieHeader(token: string): string {
  const maxAge = Math.floor(SESSION_MS / 1000);
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${POLIS_CONFIGURE_SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export function clearConfigureSessionCookieHeader(): string {
  return `${POLIS_CONFIGURE_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 } as const;

function scryptDerive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 32, SCRYPT_PARAMS, (err, derived) => {
      if (err) reject(err);
      else resolve(derived);
    });
  });
}

export async function hashConfigPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scryptDerive(password, salt);
  return `scrypt:${salt.toString("base64url")}:${derived.toString("base64url")}`;
}

export async function verifyConfigPassword(
  password: string,
  hash: string | null | undefined,
): Promise<boolean> {
  if (!hash?.trim()) return false;
  const parts = hash.split(":");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const salt = Buffer.from(parts[1]!, "base64url");
  const expected = Buffer.from(parts[2]!, "base64url");
  const derived = await scryptDerive(password, salt);
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}

