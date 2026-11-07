import { afterEach, describe, expect, test } from "bun:test";

import { fetchMdblistOwnLists, mdblistBlockedMessage } from "@/lib/mdblist-lists";
import { fetchMdblistMediaInfo } from "@/lib/mdblist-client";

const realFetch = globalThis.fetch;
const savedEnv = { ...process.env };

afterEach(() => {
  globalThis.fetch = realFetch;
  process.env = { ...savedEnv };
});

describe("mdblist list requests", () => {
  test("a rejected private list does not pause other requests for the key", async () => {
    process.env.POLIS_CACHE_DISABLE = "1";
    const paths: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      paths.push(url.pathname);
      if (url.pathname.startsWith("/lists/")) return new Response("forbidden", { status: 403 });
      return Response.json({ ratings: [{ source: "imdb", value: 7 }] });
    }) as typeof fetch;
    await expect(fetchMdblistOwnLists("list-403-key")).rejects.toThrow("forbidden");
    const media = await fetchMdblistMediaInfo({ imdbId: "tt0000201", stremioType: "movie", apiKey: "list-403-key" });
    expect(media.info?.ratings).toEqual({ imdb: 7 });
    expect(paths).toEqual(["/lists/user", "/imdb/movie/tt0000201"]);
  });

  test("explains why a list request was not sent", () => {
    expect(mdblistBlockedMessage("auth_rejected")).toBe("MDBList rejected this key. Check it under API keys.");
    expect(mdblistBlockedMessage("busy")).toBe("MDBList is busy. Try again in a moment.");
    expect(mdblistBlockedMessage("rate_limited")).toBe("MDBList rate limit reached. Try again later.");
  });
});
