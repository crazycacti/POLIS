import { createHash } from "node:crypto";

import { serializeCustomBadges, type CustomBadge } from "@/lib/custom-badges";

const FINGERPRINT_LENGTH = 16;

export function customBadgesFingerprint(badges: CustomBadge[]): string {
  if (badges.length === 0) return "";
  return createHash("sha256").update(serializeCustomBadges(badges)).digest("hex").slice(0, FINGERPRINT_LENGTH);
}
