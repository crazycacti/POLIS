import { describe, expect, test } from "bun:test";

import { fetchArtworkBytes, parseAllowedArtworkUrl, readArtworkResponseBytes } from "@/lib/artwork-url-allow";

describe("parseAllowedArtworkUrl", () => {
  test("allows known image CDNs over https", () => {
    expect(parseAllowedArtworkUrl("https://image.tmdb.org/t/p/original/a.jpg")).not.toBeNull();
    expect(parseAllowedArtworkUrl("https://assets.fanart.tv/fanart/a.jpg")).not.toBeNull();
    expect(parseAllowedArtworkUrl("https://artworks.thetvdb.com/banners/a.jpg")).not.toBeNull();
    expect(parseAllowedArtworkUrl("https://IMAGES.METAHUB.SPACE./poster/x.jpg")).not.toBeNull();
  });

  test("rejects other schemes, hosts, look-alikes, credentials and ports", () => {
    for (const raw of [
      "http://image.tmdb.org/a.jpg",
      "file:///etc/passwd",
      "a.jpg",
      "https://eviltmdb.org/a.jpg",
      "https://image.tmdb.org.evil.com/a.jpg",
      "https://user:pw@image.tmdb.org/a.jpg",
      "https://image.tmdb.org:8443/a.jpg",
      "https://127.0.0.1/a.jpg",
      "https://169.254.169.254/latest",
    ]) {
      expect(parseAllowedArtworkUrl(raw)).toBeNull();
    }
  });
});

describe("fetchArtworkBytes", () => {
  test("refuses a redirect to a host outside the allowlist", async () => {
    const seen: string[] = [];
    const bytes = await fetchArtworkBytes("https://image.tmdb.org/a.jpg", async (url) => {
      seen.push(url.toString());
      return new Response(null, { status: 302, headers: { location: "http://127.0.0.1/x" } });
    });
    expect(bytes).toBeNull();
    expect(seen).toEqual(["https://image.tmdb.org/a.jpg"]);
  });

  test("follows an allowed redirect", async () => {
    const bytes = await fetchArtworkBytes("https://image.tmdb.org/a.jpg", async (url) =>
      url.hostname === "image.tmdb.org"
        ? new Response(null, { status: 301, headers: { location: "https://assets.fanart.tv/b.jpg" } })
        : new Response(new Uint8Array([1, 2, 3])),
    );
    expect(bytes?.length).toBe(3);
  });

  test("stops after the redirect limit", async () => {
    let calls = 0;
    const bytes = await fetchArtworkBytes("https://image.tmdb.org/a.jpg", async () => {
      calls += 1;
      return new Response(null, { status: 302, headers: { location: "https://image.tmdb.org/a.jpg" } });
    });
    expect(bytes).toBeNull();
    expect(calls).toBe(4);
  });
});

describe("readArtworkResponseBytes", () => {
  test("rejects bodies over the limit even without content-length", async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(6));
        controller.enqueue(new Uint8Array(6));
        controller.close();
      },
    });
    expect(await readArtworkResponseBytes(new Response(body), 10)).toBeNull();
  });

  test("rejects a declared length over the limit", async () => {
    const res = new Response(new Uint8Array(4), { headers: { "content-length": "999" } });
    expect(await readArtworkResponseBytes(res, 10)).toBeNull();
  });
});
