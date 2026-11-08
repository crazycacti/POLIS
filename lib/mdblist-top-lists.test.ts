import { afterEach, describe, expect, it } from "bun:test";

import { popularMdblistAuthors, type MdblistListSummary } from "@/lib/mdblist-list-catalog";
import { clearMdblistTopListsCache, fetchMdblistTopLists } from "@/lib/mdblist-lists";

afterEach(() => clearMdblistTopListsCache());

function list(id: string, username: string | null, likes: number | null): MdblistListSummary {
  return { id, name: `List ${id}`, mediatype: "movie", username, items: 10, likes };
}

describe("popularMdblistAuthors", () => {
  it("ranks authors by their total likes and skips lists without an author", () => {
    const authors = popularMdblistAuthors(
      [list("1", "snoak", 500), list("2", "gary", 900), list("3", "snoak", 600), list("4", null, 5000)],
      5,
    );
    expect(authors).toEqual([
      { username: "snoak", likes: 1100 },
      { username: "gary", likes: 900 },
    ]);
  });
});

describe("fetchMdblistTopLists", () => {
  it("reads the author from user_name and serves repeat calls from cache", async () => {
    const realFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = (async (_input: RequestInfo | URL): Promise<Response> => {
      calls += 1;
      return Response.json([
        { id: 7, user_name: "snoak", name: "Latest Streaming Movies", mediatype: "movie", items: 200, likes: 1038 },
      ]);
    }) as typeof fetch;
    try {
      const first = await fetchMdblistTopLists("top-lists-test-key", {}, 1_000);
      const second = await fetchMdblistTopLists("top-lists-test-key", {}, 2_000);
      expect(first[0]).toEqual({
        id: "7",
        name: "Latest Streaming Movies",
        mediatype: "movie",
        username: "snoak",
        items: 200,
        likes: 1038,
      });
      expect(second).toBe(first);
      expect(calls).toBe(1);
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});
