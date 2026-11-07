import { polisEnvPositiveInt } from "@/lib/polis-env-int";

export type PreviewRenderKeySource = "server" | "caller";

const WINDOW_MS = 60 * 1000;
const DEFAULT_SERVER_KEY_RENDERS_PER_MIN = 30;
const DEFAULT_CALLER_KEY_RENDERS_PER_MIN = 120;

export type PreviewRenderLimits = Record<PreviewRenderKeySource, () => number>;

const ENV_LIMITS: PreviewRenderLimits = {
  server: () =>
    polisEnvPositiveInt("POLIS_PREVIEW_SERVER_KEY_RENDERS_PER_MIN") ?? DEFAULT_SERVER_KEY_RENDERS_PER_MIN,
  caller: () =>
    polisEnvPositiveInt("POLIS_PREVIEW_CALLER_KEY_RENDERS_PER_MIN") ?? DEFAULT_CALLER_KEY_RENDERS_PER_MIN,
};

export class PreviewRenderBudget {
  private readonly recent: Record<PreviewRenderKeySource, number[]> = { server: [], caller: [] };

  constructor(private readonly limits: PreviewRenderLimits = ENV_LIMITS) {}

  private live(source: PreviewRenderKeySource, now: number): number[] {
    const times = this.recent[source];
    while (times.length > 0 && now - times[0]! >= WINDOW_MS) times.shift();
    return times;
  }

  take(source: PreviewRenderKeySource, now = Date.now()): boolean {
    const times = this.live(source, now);
    if (times.length >= this.limits[source]()) return false;
    times.push(now);
    return true;
  }

  retryAfterSec(source: PreviewRenderKeySource, now = Date.now()): number {
    const oldest = this.live(source, now)[0];
    return oldest == null ? 1 : Math.max(1, Math.ceil((oldest + WINDOW_MS - now) / 1000));
  }
}

export const previewRenderBudget = new PreviewRenderBudget();
