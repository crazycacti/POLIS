import { POLIS_MIN_PASSWORD_LENGTH } from "@/lib/polis-config-auth-constants";

export type PasswordStrengthLevel = 0 | 1 | 2 | 3 | 4;

export type PasswordStrength = {
  score: PasswordStrengthLevel;
  label: string;
  percent: number;
};

const LABELS: Record<PasswordStrengthLevel, string> = {
  0: "Too short",
  1: "Weak",
  2: "Fair",
  3: "Good",
  4: "Strong",
};

export function measurePasswordStrength(password: string): PasswordStrength {
  const trimmed = password.trim();
  if (trimmed.length < POLIS_MIN_PASSWORD_LENGTH) {
    return { score: 0, label: LABELS[0], percent: 0 };
  }

  let points = 0;
  if (trimmed.length >= POLIS_MIN_PASSWORD_LENGTH) points += 1;
  if (trimmed.length >= 12) points += 1;
  if (/[a-z]/.test(trimmed) && /[A-Z]/.test(trimmed)) points += 1;
  if (/\d/.test(trimmed)) points += 1;
  if (/[^a-zA-Z0-9]/.test(trimmed)) points += 1;

  const score = Math.min(4, Math.max(1, points - 1)) as PasswordStrengthLevel;
  return {
    score,
    label: LABELS[score],
    percent: (score / 4) * 100,
  };
}
