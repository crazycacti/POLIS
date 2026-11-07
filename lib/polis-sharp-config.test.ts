import { afterEach, describe, expect, test } from "bun:test";

import { defaultSharpConcurrency } from "@/lib/polis-sharp-config";

const savedRenderLimit = process.env.POLIS_RENDER_MAX_CONCURRENT;

afterEach(() => {
  if (savedRenderLimit === undefined) delete process.env.POLIS_RENDER_MAX_CONCURRENT;
  else process.env.POLIS_RENDER_MAX_CONCURRENT = savedRenderLimit;
});

describe("defaultSharpConcurrency", () => {
  test("uses one thread per image when several renders run at once", () => {
    process.env.POLIS_RENDER_MAX_CONCURRENT = "4";
    expect(defaultSharpConcurrency()).toBe(1);
  });

  test("leaves sharp's own default when renders run one at a time", () => {
    process.env.POLIS_RENDER_MAX_CONCURRENT = "1";
    expect(defaultSharpConcurrency()).toBeNull();
  });
});
