import sharp from "sharp";

import { polisEnvNonNegativeInt, polisEnvPositiveInt } from "@/lib/polis-env-int";

let configured = false;

export function ensurePolisSharpConfigured(): void {
  if (configured) return;
  configured = true;

  const concurrency = polisEnvNonNegativeInt("POLIS_SHARP_CONCURRENCY");
  if (concurrency != null) {
    sharp.concurrency(concurrency);
  }

  const cacheMb = polisEnvPositiveInt("POLIS_SHARP_CACHE_MB");
  if (cacheMb != null) {
    const files = polisEnvPositiveInt("POLIS_SHARP_CACHE_FILES");
    const items = polisEnvPositiveInt("POLIS_SHARP_CACHE_ITEMS");
    sharp.cache({
      memory: cacheMb,
      ...(files != null ? { files } : {}),
      ...(items != null ? { items } : {}),
    });
  }
}
