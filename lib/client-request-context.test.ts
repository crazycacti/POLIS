import { describe, expect, test } from "bun:test";

import {
  clientIpFromRequest,
  clientRequestContextFromRequest,
  getClientRequestContext,
  runWithClientRequestContext,
  upstreamHeadersFromClientContext,
} from "@/lib/client-request-context";

describe("clientIpFromRequest", () => {
  test("uses leftmost x-forwarded-for address", () => {
    const request = new Request("http://localhost/", {
      headers: { "x-forwarded-for": "203.0.113.9, 10.0.0.1" },
    });
    expect(clientIpFromRequest(request)).toBe("203.0.113.9");
  });

  test("falls back to cf-connecting-ip", () => {
    const request = new Request("http://localhost/", {
      headers: { "cf-connecting-ip": "198.51.100.4" },
    });
    expect(clientIpFromRequest(request)).toBe("198.51.100.4");
  });
});

describe("runWithClientRequestContext", () => {
  test("forwards client headers on upstream fetch init", async () => {
    const request = new Request("http://localhost/", {
      headers: {
        "x-forwarded-for": "203.0.113.9",
        "user-agent": "Stremio/4.4",
        "accept-language": "en-US,en;q=0.9",
      },
    });

    await runWithClientRequestContext(request, async () => {
      const ctx = getClientRequestContext();
      expect(ctx?.ip).toBe("203.0.113.9");
      expect(ctx?.userAgent).toBe("Stremio/4.4");

      const headers = upstreamHeadersFromClientContext({ Accept: "application/json" });
      expect(headers["X-Forwarded-For"]).toBe("203.0.113.9");
      expect(headers["User-Agent"]).toBe("Stremio/4.4");
      expect(headers["Accept-Language"]).toBe("en-US,en;q=0.9");
      expect(headers.accept).toBe("application/json");
    });
  });

  test("returns null context without forwarded ip", () => {
    const request = new Request("http://localhost/");
    expect(clientRequestContextFromRequest(request)).toBeNull();
  });
});
