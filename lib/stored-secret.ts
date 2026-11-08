import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

import { polisSessionSecret } from "@/lib/polis-config-auth";

const PREFIX = "enc:v1:";
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;
const HKDF_INFO = "polis stored api keys v1";

let cachedKey: { source: string; key: Buffer } | null = null;
let warnedUnreadable = false;

function dataKey(): Buffer {
  const explicit = process.env.POLIS_DATA_KEY?.trim();
  const source = explicit ? `data:${explicit}` : `session:${polisSessionSecret()}`;
  if (cachedKey?.source === source) return cachedKey.key;
  const ikm = Buffer.from(explicit ?? polisSessionSecret(), "utf8");
  const key = Buffer.from(hkdfSync("sha256", ikm, Buffer.alloc(0), HKDF_INFO, KEY_BYTES));
  cachedKey = { source, key };
  return key;
}

export function isSealedSecret(value: string | null | undefined): boolean {
  return Boolean(value?.startsWith(PREFIX));
}

export function sealSecret(plain: string | null): string | null {
  if (plain == null || plain === "") return plain;
  if (isSealedSecret(plain)) return plain;
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", dataKey(), iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return PREFIX + Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url");
}

export function openSecret(stored: string | null): string | null {
  if (stored == null || stored === "") return null;
  if (!isSealedSecret(stored)) return stored;
  try {
    const raw = Buffer.from(stored.slice(PREFIX.length), "base64url");
    const iv = raw.subarray(0, IV_BYTES);
    const tag = raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
    const decipher = createDecipheriv("aes-256-gcm", dataKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(raw.subarray(IV_BYTES + TAG_BYTES)), decipher.final()]).toString("utf8");
  } catch {
    if (!warnedUnreadable) {
      warnedUnreadable = true;
      console.warn("[polis] a stored api key could not be decrypted; POLIS_DATA_KEY or POLIS_SESSION_SECRET changed");
    }
    return null;
  }
}
