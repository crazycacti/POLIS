import { polisEnvPositiveInt } from "@/lib/polis-env-int";
import { SlidingWindowLimiter } from "@/lib/sliding-window-limiter";

export type PreviewRenderKeySource = "server" | "caller";

const WINDOW_MS = 60 * 1000;
const DEFAULT_PER_CLIENT_RENDERS_PER_MIN = 40;
const DEFAULT_SERVER_KEY_RENDERS_PER_MIN = 150;
const DEFAULT_CALLER_KEY_RENDERS_PER_MIN = 600;

export type PreviewRenderLimits = {
  perClient: () => number;
  total: Record<PreviewRenderKeySource, () => number>;
};

const ENV_LIMITS: PreviewRenderLimits = {
  perClient: () => polisEnvPositiveInt("POLIS_PREVIEW_RENDERS_PER_CLIENT_PER_MIN") ?? DEFAULT_PER_CLIENT_RENDERS_PER_MIN,
  total: {
    server: () =>
      polisEnvPositiveInt("POLIS_PREVIEW_SERVER_KEY_RENDERS_PER_MIN") ?? DEFAULT_SERVER_KEY_RENDERS_PER_MIN,
    caller: () =>
      polisEnvPositiveInt("POLIS_PREVIEW_CALLER_KEY_RENDERS_PER_MIN") ?? DEFAULT_CALLER_KEY_RENDERS_PER_MIN,
  },
};

export class PreviewRenderBudget {
  private readonly perClient: SlidingWindowLimiter;
  private readonly total: Record<PreviewRenderKeySource, SlidingWindowLimiter>;

  constructor(limits: PreviewRenderLimits = ENV_LIMITS) {
    this.perClient = new SlidingWindowLimiter(WINDOW_MS, limits.perClient);
    this.total = {
      server: new SlidingWindowLimiter(WINDOW_MS, limits.total.server, 1),
      caller: new SlidingWindowLimiter(WINDOW_MS, limits.total.caller, 1),
    };
  }

  take(source: PreviewRenderKeySource, clientKey: string, now = Date.now()): boolean {
    const total = this.total[source];
    if (!this.perClient.allows(clientKey, now) || !total.allows(source, now)) return false;
    this.perClient.record(clientKey, now);
    total.record(source, now);
    return true;
  }

  retryAfterSec(source: PreviewRenderKeySource, clientKey: string, now = Date.now()): number {
    return Math.max(1, this.perClient.retryAfterSec(clientKey, now), this.total[source].retryAfterSec(source, now));
  }
}

export const previewRenderBudget = new PreviewRenderBudget();
