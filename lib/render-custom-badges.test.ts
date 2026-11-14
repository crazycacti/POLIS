import { describe, expect, it } from "bun:test";

import { parseCustomBadges } from "@/lib/custom-badges";
import { softFontAvailable } from "@/lib/poster-soft-font";
import {
  cornerWidthLimit,
  customBadgeNaturalWidth,
  placeCustomBadges,
  type CustomBadgeBox,
} from "@/lib/render-custom-badges";

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
  const badge = (text: string, corner: string) => ({ text, corner, color: "#ffffff", background: "#000000" });

  it.skipIf(!softFontAvailable())("lets a badge use the room its opposite corner leaves and shares fairly when both are wide", () => {
    const badges = parseCustomBadges([
      badge("Family night", "top-left"),
      badge("A", "top-right"),
      badge("A very long label", "bottom-left"),
      badge("Another long one", "bottom-right"),
    ]) ?? [];
    const limit = cornerWidthLimit({ badges, fs: 29, innerWidth: 420, gap: 20, soloShare: 0.85 });
    const at = (index: number) => {
      const target = badges[index];
      if (!target) throw new Error("missing badge");
      return target;
    };
    const natural = (index: number) => customBadgeNaturalWidth(at(index), 29);
    const drawn = (index: number) => Math.min(natural(index), limit(at(index).corner));
    expect(drawn(0)).toBe(natural(0));
    expect(drawn(0) + drawn(1)).toBeLessThanOrEqual(400);
    expect(drawn(2) + drawn(3)).toBeLessThanOrEqual(400);
    expect(drawn(2)).toBeLessThan(natural(2));
  });

  it("gives a lone corner most of the width", () => {
    const badges = parseCustomBadges([badge("Solo", "bottom-left")]) ?? [];
    expect(cornerWidthLimit({ badges, fs: 29, innerWidth: 420, gap: 20, soloShare: 0.85 })("bottom-left")).toBe(357);
  });
});
