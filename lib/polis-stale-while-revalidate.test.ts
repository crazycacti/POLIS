import { describe, expect, test } from "bun:test";

import { serveFreshOrStale } from "@/lib/polis-stale-while-revalidate";

function harness(initial: { fresh?: string; stale?: string }, build: () => Promise<string>) {
  const state = { fresh: initial.fresh ?? null, stale: initial.stale ?? null, builds: 0 };
  const run = (key: string) =>
    serveFreshOrStale({
      key,
      label: "test",
      readFresh: async () => state.fresh,
      readStale: async () => state.stale,
      build: async () => {
        state.builds += 1;
        return build();
      },
      store: async (value) => {
        state.fresh = value;
        state.stale = value;
      },
      isStorable: (value) => value.length > 0,
    });
  return { state, run };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 10));

describe("serveFreshOrStale", () => {
  test("returns a fresh hit without building", async () => {
    const { state, run } = harness({ fresh: "a" }, async () => "b");
    expect(await run("swr-fresh")).toBe("a");
    expect(state.builds).toBe(0);
  });

  test("builds and stores when nothing is cached", async () => {
    const { state, run } = harness({}, async () => "b");
    expect(await run("swr-empty")).toBe("b");
    await settle();
    expect(state.fresh).toBe("b");
  });

  test("serves the stale copy and refreshes in the background", async () => {
    const { state, run } = harness({ stale: "old" }, async () => "new");
    expect(await run("swr-stale")).toBe("old");
    await settle();
    expect(state.builds).toBe(1);
    expect(state.fresh).toBe("new");
  });

  test("waits before retrying a failed background refresh", async () => {
    const { state, run } = harness({ stale: "old" }, async () => {
      throw new Error("upstream down");
    });
    expect(await run("swr-fail")).toBe("old");
    await settle();
    expect(await run("swr-fail")).toBe("old");
    await settle();
    expect(state.builds).toBe(1);
  });

  test("waits before retrying an empty background refresh", async () => {
    const { state, run } = harness({ stale: "old" }, async () => "");
    await run("swr-blank");
    await settle();
    await run("swr-blank");
    await settle();
    expect(state.builds).toBe(1);
    expect(state.fresh).toBeNull();
  });
});
