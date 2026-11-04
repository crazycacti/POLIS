import { describe, expect, test } from "bun:test";

import { matchesStarterLook, STARTER_LOOKS } from "@/lib/poster-looks";
import { POSTER_OVERLAY_DEFAULTS } from "@/lib/poster-query";

describe("starter looks", () => {
  test("the defaults are the Clean look and no other", () => {
    const matching = STARTER_LOOKS.filter((look) => matchesStarterLook(POSTER_OVERLAY_DEFAULTS, look));
    expect(matching.map((look) => look.id)).toEqual(["clean"]);
  });
});
