import { describe, expect, test } from "bun:test";

import { RenderLimitedError, renderAdmissionFor } from "@/lib/client-render-budget";
import { SlidingWindowLimiter } from "@/lib/sliding-window-limiter";
import { runAsBackgroundUpstreamWork } from "@/lib/upstream-priority";

describe("renderAdmissionFor", () => {
  test("refuses a client past its limit with a retry time", () => {
    const admit = renderAdmissionFor(new SlidingWindowLimiter(60_000, () => 1), "203.0.113.1");
    admit();
    let refused: unknown = null;
    try {
      admit();
    } catch (error) {
      refused = error;
    }
    expect(refused).toBeInstanceOf(RenderLimitedError);
    expect((refused as RenderLimitedError).retryAfterSec).toBeGreaterThan(0);
  });

  test("keeps clients apart", () => {
    const limiter = new SlidingWindowLimiter(60_000, () => 1);
    renderAdmissionFor(limiter, "203.0.113.1")();
    expect(() => renderAdmissionFor(limiter, "203.0.113.2")()).not.toThrow();
  });

  test("never counts background prewarm renders", async () => {
    const limiter = new SlidingWindowLimiter(60_000, () => 1);
    const admit = renderAdmissionFor(limiter, "unknown");
    await runAsBackgroundUpstreamWork(async () => {
      admit();
      admit();
    });
    expect(() => admit()).not.toThrow();
  });
});
