import { describe, expect, test } from "bun:test";

import { mergePosterQueryForConfigurePreview } from "@/lib/integrator-auth";

describe("mergePosterQueryForConfigurePreview", () => {
  test("omits browser TMDB when server has TMDB", () => {
    const tmdb = new URLSearchParams({ api_key: "stale-from-localstorage" });
    const qs = mergePosterQueryForConfigurePreview(
      "genre=1",
      {
        hasServerTmdb: true,
        hasServerMdblist: false,
        hasServerFanart: false,
        hasServerTvdb: false,
      },
      tmdb,
      { mdblistApiKey: null },
    );
    expect(qs).toBe("genre=1");
    expect(qs.includes("api_key=")).toBe(false);
  });

  test("keeps browser TMDB when server has none", () => {
    const tmdb = new URLSearchParams({ api_key: "user-key-1234567890" });
    const qs = mergePosterQueryForConfigurePreview(
      "genre=1",
      {
        hasServerTmdb: false,
        hasServerMdblist: false,
        hasServerFanart: false,
        hasServerTvdb: false,
      },
      tmdb,
      {},
    );
    expect(qs).toContain("api_key=user-key-1234567890");
  });

  test("omits browser MDBList when server has MDBList", () => {
    const qs = mergePosterQueryForConfigurePreview(
      "genre=1",
      {
        hasServerTmdb: true,
        hasServerMdblist: true,
        hasServerFanart: false,
        hasServerTvdb: false,
      },
      undefined,
      { mdblistApiKey: "stale-mdblist" },
    );
    expect(qs).toBe("genre=1");
    expect(qs.includes("mdblist")).toBe(false);
  });
});
