import { describe, expect, it } from "bun:test";

import { parseCustomBadges } from "@/lib/custom-badges";
import { cornerWidthLimit, placeCustomBadges, type CustomBadgeBox } from "@/lib/render-custom-badges";

const box = (corner: CustomBadgeBox["corner"], height = 40): CustomBadgeBox => ({
  corner,
  width: 100,
  height,
  svg: (left, top) => `${corner}@${left},${top};`,
});
const area = { top: 100, bottom: 300, left: 20, right: 480, gap: 10 };
const bounds = { "top-left": area, "top-right": area, "bottom-left": area, "bottom-right": area };

describe("placeCustomBadges", () => {
  it("stacks top corners downward and bottom corners upward from their edges", () => {
    const placed = placeCustomBadges([box("top-left"), box("top-left"), box("bottom-right")], bounds);
    expect(placed.svg).toBe("top-left@20,100;top-left@20,150;bottom-right@380,260;");
    expect(placed.topBottom).toBe(190);
    expect(placed.bottomTop).toBe(260);
  });

  it("skips badges that would run past their corner's reach instead of overlapping", () => {
    const placed = placeCustomBadges([box("top-right", 150), box("top-right", 150)], bounds);
    expect(placed.svg).toBe("top-right@380,100;");
  });
});

describe("cornerWidthLimit", () => {
  it("halves the width only when the opposite corner on the same edge is used", () => {
    const badges = parseCustomBadges([
      { text: "A", corner: "top-left", color: "#ffffff", background: "#000000" },
      { text: "B", corner: "top-right", color: "#ffffff", background: "#000000" },
      { text: "C", corner: "bottom-left", color: "#ffffff", background: "#000000" },
    ]) ?? [];
    const limit = cornerWidthLimit(badges, 420, 20, 0.85);
    expect(limit("top-left")).toBe(200);
    expect(limit("bottom-left")).toBe(357);
  });
});
