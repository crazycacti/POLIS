import { polisEnvPositiveInt } from "@/lib/polis-env-int";
import { SlidingWindowLimiter } from "@/lib/sliding-window-limiter";
import { upstreamCallIsBackground } from "@/lib/upstream-priority";

const RENDER_WINDOW_MS = 60 * 1000;
const DEFAULT_POSTER_RENDERS_PER_CLIENT_PER_MIN = 300;

export class RenderLimitedError extends Error {
  constructor(readonly retryAfterSec: number) {
    super("Render limit reached");
    this.name = "RenderLimitedError";
  }
}

export type RenderAdmission = () => void;

export function renderAdmissionFor(limiter: SlidingWindowLimiter, clientKey: string): RenderAdmission {
  return () => {
    if (upstreamCallIsBackground()) return;
    if (!limiter.take(clientKey)) throw new RenderLimitedError(limiter.retryAfterSec(clientKey));
  };
}

export const posterRendersPerClient = new SlidingWindowLimiter(
  RENDER_WINDOW_MS,
  () => polisEnvPositiveInt("POLIS_POSTER_RENDERS_PER_CLIENT_PER_MIN") ?? DEFAULT_POSTER_RENDERS_PER_CLIENT_PER_MIN,
);

export function renderLimitedResponseInit(error: RenderLimitedError, init?: HeadersInit): ResponseInit {
  const headers = new Headers(init);
  headers.set("Cache-Control", "no-store");
  headers.set("Retry-After", String(error.retryAfterSec));
  return { status: 429, headers };
}
