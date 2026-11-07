import { describe, expect, test } from "bun:test";

import { readJsonBody } from "@/lib/request-json-body";

function post(body: BodyInit, headers: Record<string, string> = {}) {
  return new Request("http://polis.test/api/x", { method: "POST", body, headers });
}

describe("readJsonBody", () => {
  test("parses a body within the limit", async () => {
    expect(await readJsonBody(post('{"a":1}'), 64)).toEqual({ ok: true, value: { a: 1 } });
  });

  test("refuses a declared length over the limit before reading", async () => {
    expect(await readJsonBody(post("{}", { "content-length": "999999" }), 64)).toEqual({ ok: false, status: 413 });
  });

  test("refuses a streamed body that grows past the limit", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let i = 0; i < 10; i++) controller.enqueue(new TextEncoder().encode('"xxxxxxxxxx",'));
        controller.close();
      },
    });
    expect(await readJsonBody(post(stream), 64)).toEqual({ ok: false, status: 413 });
  });

  test("reports malformed and missing bodies as bad requests", async () => {
    expect(await readJsonBody(post("{oops"), 64)).toEqual({ ok: false, status: 400 });
    expect(await readJsonBody(new Request("http://polis.test/", { method: "POST" }), 64)).toEqual({
      ok: false,
      status: 400,
    });
  });
});
