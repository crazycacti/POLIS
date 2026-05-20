import { describe, expect, test } from "bun:test";

import { polisSingleflight, polisSingleflightInFlightCount } from "@/lib/polis-singleflight";

describe("polisSingleflight", () => {
  test("runs fn once for concurrent callers", async () => {
    let runs = 0;
    const fn = async () => {
      runs++;
      await new Promise((r) => setTimeout(r, 30));
      return 42;
    };

    const results = await Promise.all([
      polisSingleflight("k1", fn),
      polisSingleflight("k1", fn),
      polisSingleflight("k1", fn),
    ]);

    expect(runs).toBe(1);
    expect(results).toEqual([42, 42, 42]);
    expect(polisSingleflightInFlightCount()).toBe(0);
  });

  test("uses separate flights per key", async () => {
    let runs = 0;
    const fn = async () => {
      runs++;
      return 1;
    };
    await Promise.all([polisSingleflight("a", fn), polisSingleflight("b", fn)]);
    expect(runs).toBe(2);
  });
});
