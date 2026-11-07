import { describe, expect, test } from "bun:test";

import {
  applyLookFields,
  decodeLookCode,
  encodeLookCode,
  LOOK_CODE_MAX_LENGTH,
  lookShareUrl,
  lookToJson,
  parseLookJson,
  rejectedLookFields,
} from "@/lib/poster-look-code";
import { POSTER_OVERLAY_DEFAULTS, type PosterOverlayQuery } from "@/lib/poster-query";

const custom: PosterOverlayQuery = {
  ...POSTER_OVERLAY_DEFAULTS,
  genre: true,
  qualityTags: true,
  look: "classic",
  ratingSource: "imdb",
  ratingColor: "#ff8800",
  trendFontSize: 52,
  artwork: "fanart",
};

describe("look codes", () => {
  test("round trip a look through a code and a share link", () => {
    const code = encodeLookCode(custom);
    expect(code.startsWith("v1.")).toBe(true);
    const fromCode = decodeLookCode(code);
    expect(fromCode?.look).toBe("classic");
    expect(fromCode?.ratingColor).toBe("#ff8800");
    expect(fromCode?.trendFontSize).toBe(52);

    const link = lookShareUrl("https://polis.example", custom);
    expect(decodeLookCode(link)).toEqual(fromCode);
  });

  test("a look never carries artwork sources or a trend rank", () => {
    const fields = decodeLookCode(encodeLookCode({ ...custom, trendRank: 3 }));
    expect(fields).not.toBeNull();
    expect("artwork" in fields!).toBe(false);
    expect("trendRank" in fields!).toBe(false);
    const applied = applyLookFields({ ...POSTER_OVERLAY_DEFAULTS, artwork: "tvdb" }, fields!);
    expect(applied.artwork).toBe("tvdb");
    expect(applied.look).toBe("classic");
  });

  test("rejects malformed and oversized codes", () => {
    expect(decodeLookCode("v2.abc")).toBeNull();
    expect(decodeLookCode("v1.not base64!")).toBeNull();
    expect(decodeLookCode("https://polis.example/configure")).toBeNull();
    expect(decodeLookCode(`v1.${"a".repeat(LOOK_CODE_MAX_LENGTH)}`)).toBeNull();
  });
});

describe("look json", () => {
  test("round trips through json and clamps out of range values", () => {
    const parsed = parseLookJson(lookToJson(custom));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const applied = applyLookFields(POSTER_OVERLAY_DEFAULTS, { ...parsed.fields, trendFontSize: 999 });
    expect(applied.look).toBe("classic");
    expect(applied.trendFontSize).toBeLessThanOrEqual(72);
  });

  test("names the problem for unknown keys, wrong types and non objects", () => {
    expect(parseLookJson("{\"sparkle\": true}")).toEqual({ ok: false, error: "Unknown setting: sparkle" });
    expect(parseLookJson("{\"genre\": \"yes\"}")).toEqual({ ok: false, error: "genre must be a boolean." });
    expect(parseLookJson("{\"artwork\": \"tmdb\"}").ok).toBe(false);
    expect(parseLookJson("[1]").ok).toBe(false);
    expect(parseLookJson("{").ok).toBe(false);
  });

  test("reports values the renderer would not accept instead of changing them silently", () => {
    const parsed = parseLookJson("{\"look\": \"neon\", \"trendFontSize\": 999, \"genre\": true}");
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(rejectedLookFields(POSTER_OVERLAY_DEFAULTS, parsed.fields).sort()).toEqual(["look", "trendFontSize"]);
  });

  test("treats object built-ins as unknown settings", () => {
    expect(parseLookJson("{\"toString\": 1}")).toEqual({ ok: false, error: "Unknown setting: toString" });
    expect(parseLookJson("{\"__proto__\": {}}")).toEqual({ ok: false, error: "Unknown setting: __proto__" });
  });

  test("imports a pasted link without a scheme", () => {
    const link = lookShareUrl("https://polis.example", custom).replace("https://", "");
    expect(decodeLookCode(link)?.look).toBe("classic");
  });
});
