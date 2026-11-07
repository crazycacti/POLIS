import { afterEach, describe, expect, test } from "bun:test";

import { proxyClientKey } from "@/lib/client-request-context";
import { fetchUpstream, POLIS_USER_AGENT } from "@/lib/upstream-fetch";

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("proxyClientKey", () => {
  test("uses the hop the proxy appended last", () => {
    const request = new Request("http://localhost/", {
      headers: { "x-forwarded-for": "198.51.100.1, 203.0.113.9" },
    });
    expect(proxyClientKey(request)).toBe("203.0.113.9");
  });
});

describe("fetchUpstream", () => {
  test("sends the POLIS user agent and nothing from the visitor", async () => {
    let sent: Headers | null = null;
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      sent = new Headers(init?.headers);
      return new Response("{}");
    }) as typeof fetch;

    await fetchUpstream("https://api.example.test/x", { headers: { Accept: "application/json" } });

    const headers = sent as Headers | null;
    expect(headers?.get("user-agent")).toBe(POLIS_USER_AGENT);
    expect(headers?.get("accept")).toBe("application/json");
    expect(headers?.has("x-forwarded-for")).toBe(false);
    expect(headers?.has("accept-language")).toBe(false);
  });

  test("keeps api keys out of network errors", async () => {
    globalThis.fetch = (async () => {
      const error = new Error("Unable to connect. https://api.example.test/x?api_key=SECRETVALUE");
      Object.assign(error, { path: "https://api.example.test/x?api_key=SECRETVALUE" });
      throw error;
    }) as unknown as typeof fetch;

    const error = await fetchUpstream("https://api.example.test/x?api_key=SECRETVALUE").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(Error);
    expect(Bun.inspect(error)).not.toContain("SECRETVALUE");
  });

  test("redacts key-like parameters with a provider prefix", async () => {
    globalThis.fetch = (async () => {
      throw new Error("failed https://x.test/?fanart_api_key=SECRETVALUE&client_key=OTHERSECRET");
    }) as unknown as typeof fetch;

    const error = await fetchUpstream("https://x.test/").catch((e: unknown) => e);

    expect(Bun.inspect(error)).not.toContain("SECRETVALUE");
    expect(Bun.inspect(error)).not.toContain("OTHERSECRET");
  });
});
