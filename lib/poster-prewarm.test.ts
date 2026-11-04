import { describe, expect, test } from "bun:test";

import { posterPrewarmTarget } from "@/lib/poster-prewarm";

const CONFIG_ID = "AbCdEfGhIjKlMnOp";

describe("posterPrewarmTarget", () => {
  test("reads a config poster url", () => {
    expect(
      posterPrewarmTarget(
        `https://polis.example/${CONFIG_ID}/poster/imdb/poster-default/tt0111161.jpg?rating=1`,
        "https://polis.example/",
      ),
    ).toEqual({
      url: `https://polis.example/${CONFIG_ID}/poster/imdb/poster-default/tt0111161.jpg?rating=1`,
      imdbId: "tt0111161",
      configId: CONFIG_ID,
    });
  });

  test("reads a poster url under a base path", () => {
    expect(
      posterPrewarmTarget(
        "https://host.example/polis/poster/imdb/poster-default/tt0111161.jpg",
        "https://host.example/polis",
      ),
    ).toMatchObject({ imdbId: "tt0111161", configId: null });
  });

  test("ignores other hosts and lookalike prefixes", () => {
    const path = "/poster/imdb/poster-default/tt0111161.jpg";
    expect(posterPrewarmTarget(`https://other.example${path}`, "https://polis.example")).toBeNull();
    expect(
      posterPrewarmTarget(`https://polis.example.evil${path}`, "https://polis.example"),
    ).toBeNull();
  });

  test("ignores reserved segments and other routes", () => {
    expect(
      posterPrewarmTarget(
        "https://polis.example/catalog/poster/imdb/poster-default/tt0111161.jpg",
        "https://polis.example",
      ),
    ).toBeNull();
    expect(
      posterPrewarmTarget(
        `https://polis.example/${CONFIG_ID}/backdrop/imdb/default/tt0111161.jpg`,
        "https://polis.example",
      ),
    ).toBeNull();
  });
});
