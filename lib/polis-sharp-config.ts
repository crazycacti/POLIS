import sharp from "sharp";

import { polisEnvNonNegativeInt, polisEnvPositiveInt } from "@/lib/polis-env-int";
import { polisRenderMaxConcurrent } from "@/lib/polis-render-limit";

let configured = false;

const SINGLE_THREAD_PER_IMAGE = 1;

export function defaultSharpConcurrency(): number | null {
  return polisRenderMaxConcurrent() > 1 ? SINGLE_THREAD_PER_IMAGE : null;
}

export function ensurePolisSharpConfigured(): void {
  if (configured) return;
  configured = true;

  const concurrency = polisEnvNonNegativeInt("POLIS_SHARP_CONCURRENCY") ?? defaultSharpConcurrency();
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
