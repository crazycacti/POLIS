import { afterEach, describe, expect, test } from "bun:test";

import { validateMdblistKey } from "@/lib/api-key-validate";

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

function answerWith(status: number, body: string) {
  globalThis.fetch = (async (_input: RequestInfo | URL) => new Response(body, { status })) as typeof fetch;
}

describe("validateMdblistKey", () => {
  test("keeps a key that is over its daily limit", async () => {
    answerWith(429, '{"error":"Daily API limit exceeded!"}');
    const result = await validateMdblistKey("abcdefghijklmnop");
    expect(result.ok).toBe(true);
    expect(result.limited).toBe(true);
    expect(result.message).toContain("daily limit");
  });

  test("still rejects a key MDBList does not accept", async () => {
    answerWith(401, '{"error":"Invalid API key"}');
    expect((await validateMdblistKey("abcdefghijklmnop")).ok).toBe(false);
  });

  test("still reports other upstream failures", async () => {
    answerWith(503, "unavailable");
    expect(await validateMdblistKey("abcdefghijklmnop")).toEqual({
      ok: false,
      message: "MDBList returned 503.",
    });
  });
});
