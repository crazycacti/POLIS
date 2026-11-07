import { afterEach, describe, expect, test } from "bun:test";
import { availableParallelism } from "node:os";

import { withPolisRenderLimit } from "@/lib/polis-render-limit";

const EXTRA_TASKS = 3;
const TASK_MS = 5;
const savedLimit = process.env.POLIS_RENDER_MAX_CONCURRENT;

afterEach(() => {
  if (savedLimit === undefined) delete process.env.POLIS_RENDER_MAX_CONCURRENT;
  else process.env.POLIS_RENDER_MAX_CONCURRENT = savedLimit;
});

async function peakConcurrency(tasks: number): Promise<number> {
  let active = 0;
  let peak = 0;
  const results = await Promise.all(
    Array.from({ length: tasks }, (_, index) =>
      withPolisRenderLimit(async () => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, TASK_MS));
        active -= 1;
        return index;
      }),
    ),
  );
  expect(results).toEqual(Array.from({ length: tasks }, (_, index) => index));
  return peak;
}

describe("withPolisRenderLimit", () => {
  test("bounds renders to the CPU count when no limit is configured", async () => {
    delete process.env.POLIS_RENDER_MAX_CONCURRENT;
    const cpus = availableParallelism();
    expect(await peakConcurrency(cpus + EXTRA_TASKS)).toBe(cpus);
  });

  test("uses the configured limit", async () => {
    process.env.POLIS_RENDER_MAX_CONCURRENT = "2";
    expect(await peakConcurrency(2 + EXTRA_TASKS)).toBe(2);
  });

  test("frees a slot when a render fails", async () => {
    process.env.POLIS_RENDER_MAX_CONCURRENT = "1";
    await expect(withPolisRenderLimit(() => Promise.reject(new Error("render failed")))).rejects.toThrow(
      "render failed",
    );
    expect(await withPolisRenderLimit(async () => "next")).toBe("next");
  });
});
