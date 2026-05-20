export const POLIS_MIN_PASSWORD_LENGTH = 8;

export function validateNewPasswordPair(
  password: unknown,
  confirm: unknown,
): { ok: true; password: string } | { ok: false; error: string } {
  if (typeof password !== "string" || typeof confirm !== "string") {
    return { ok: false, error: "Password and confirmation are required." };
  }
  const trimmed = password.trim();
  const confirmTrimmed = confirm.trim();
  if (trimmed.length < POLIS_MIN_PASSWORD_LENGTH) {
    return {
      ok: false,
      error: `Password must be at least ${POLIS_MIN_PASSWORD_LENGTH} characters.`,
    };
  }
  if (trimmed !== confirmTrimmed) {
    return { ok: false, error: "Passwords do not match." };
  }
  return { ok: true, password: trimmed };
}
