import { afterAll, describe, expect, it } from "bun:test";

import { fetchUpstream } from "@/lib/upstream-fetch";

const TIMEOUT_MS = 150;

describe("fetchUpstream", () => {
  const server = Bun.serve({
    port: 0,
    fetch() {
      const body = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("{"));
        },
      });
      return new Response(body, { headers: { "Content-Type": "application/json" } });
    },
  });

  afterAll(() => {
    server.stop(true);
  });

  it("times out a body that stalls after the headers arrive", async () => {
    const response = await fetchUpstream(`http://localhost:${server.port}/`, {
      timeoutMs: TIMEOUT_MS,
    });
    expect(response.ok).toBe(true);
    await expect(response.text()).rejects.toThrow();
  });
});
