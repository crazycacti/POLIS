import { CUSTOM_BADGE_ICONS, type IconShape } from "@/lib/custom-badge-icons";
import type { CustomBadge, CustomBadgeCorner } from "@/lib/custom-badges";
import { fitSoftText, measureSoftText, softCapHeight, softTextPath } from "@/lib/poster-soft-font";

const CAPSULE_HEIGHT = 1.62;
const CAPSULE_PAD_X = 0.62;
const ICON_SIZE = 1.05;
const ICON_TEXT_GAP = 0.32;
const ICON_VIEWBOX = 24;
const ICON_STROKE = 2.2;
const TEXT_WEIGHT = 600;

export type CustomBadgeBox = {
  corner: CustomBadgeCorner;
  width: number;
  height: number;
  svg: (left: number, top: number) => string;
};

function shapeSvg(shape: IconShape): string {
  const [tag, attrs] = shape;
  const pairs = Object.entries(attrs).map(([name, value]) => `${name}="${value}"`);
  return `<${tag} ${pairs.join(" ")}/>`;
}

function iconSvg(badge: CustomBadge, x: number, y: number, size: number): string {
  if (!badge.icon) return "";
  const scale = size / ICON_VIEWBOX;
  const shapes = CUSTOM_BADGE_ICONS[badge.icon].map(shapeSvg).join("");
  return `<g transform="translate(${x.toFixed(2)} ${y.toFixed(2)}) scale(${scale.toFixed(4)})" fill="none" stroke="${badge.color}" stroke-width="${ICON_STROKE}" stroke-linecap="round" stroke-linejoin="round">${shapes}</g>`;
}

export function buildCustomBadgeBoxes(params: {
  badges: CustomBadge[];
  fs: number;
  alpha: number;
  maxWidth: (corner: CustomBadgeCorner) => number;
}): CustomBadgeBox[] {
  const { fs, alpha } = params;
  const height = Math.round(fs * CAPSULE_HEIGHT);
  const padX = Math.round(fs * CAPSULE_PAD_X);
  const iconSize = Math.round(fs * ICON_SIZE);
  const iconGap = Math.round(fs * ICON_TEXT_GAP);
  const boxes: CustomBadgeBox[] = [];
  for (const badge of params.badges) {
    const iconWidth = badge.icon ? iconSize + (badge.text ? iconGap : 0) : 0;
    const maxWidth = params.maxWidth(badge.corner);
    const text = badge.text ? fitSoftText(badge.text, fs, TEXT_WEIGHT, maxWidth - padX * 2 - iconWidth) : "";
    const textWidth = text ? measureSoftText(text, fs, TEXT_WEIGHT) : 0;
    if (!text && !badge.icon) continue;
    const width = Math.round(padX * 2 + iconWidth + textWidth);
    boxes.push({
      corner: badge.corner,
      width,
      height,
      svg: (left, top) => {
        const parts = [
          `<rect x="${left}" y="${top}" width="${width}" height="${height}" rx="${(height / 2).toFixed(2)}" fill="${badge.background}" fill-opacity="${alpha.toFixed(3)}"/>`,
          iconSvg(badge, left + padX, top + (height - iconSize) / 2, iconSize),
        ];
        if (text) {
          const placed = softTextPath(text, left + padX + iconWidth, top + height / 2 + softCapHeight(fs, TEXT_WEIGHT) / 2, fs, TEXT_WEIGHT);
          if (placed) parts.push(`<path d="${placed.d}" fill="${badge.color}"/>`);
        }
        return parts.join("");
      },
    });
  }
  return boxes;
}

const OPPOSITE_CORNER: Record<CustomBadgeCorner, CustomBadgeCorner> = {
  "top-left": "top-right",
  "top-right": "top-left",
  "bottom-left": "bottom-right",
  "bottom-right": "bottom-left",
};

export function customBadgeNaturalWidth(badge: CustomBadge, fs: number): number {
  const iconWidth = badge.icon ? Math.round(fs * ICON_SIZE) + (badge.text ? Math.round(fs * ICON_TEXT_GAP) : 0) : 0;
  const textWidth = badge.text ? measureSoftText(badge.text, fs, TEXT_WEIGHT) : 0;
  return Math.round(fs * CAPSULE_PAD_X) * 2 + iconWidth + textWidth;
}

export function cornerWidthLimit(params: {
  badges: CustomBadge[];
  fs: number;
  innerWidth: number;
  gap: number;
  soloShare: number;
}) {
  const solo = Math.floor(params.innerWidth * params.soloShare);
  const widest = new Map<CustomBadgeCorner, number>();
  for (const badge of params.badges) {
    widest.set(badge.corner, Math.max(widest.get(badge.corner) ?? 0, customBadgeNaturalWidth(badge, params.fs)));
  }
  return (corner: CustomBadgeCorner): number => {
    const mine = widest.get(corner) ?? 0;
    const theirs = widest.get(OPPOSITE_CORNER[corner]) ?? 0;
    if (theirs === 0) return solo;
    const room = params.innerWidth - params.gap;
    if (mine + theirs <= room) return Math.min(solo, room - theirs);
    return Math.floor((room * mine) / (mine + theirs));
  };
}

export type CornerBounds = { top: number; bottom: number; left: number; right: number; gap: number };

export type PlacedCustomBadges = { svg: string; topBottom: number; bottomTop: number };

export function placeCustomBadges(
  boxes: CustomBadgeBox[],
  bounds: Record<CustomBadgeCorner, CornerBounds>,
): PlacedCustomBadges {
  const parts: string[] = [];
  let topBottom = 0;
  let bottomTop = Number.POSITIVE_INFINITY;
  const cursor: Record<CustomBadgeCorner, number> = {
    "top-left": bounds["top-left"].top,
    "top-right": bounds["top-right"].top,
    "bottom-left": bounds["bottom-left"].bottom,
    "bottom-right": bounds["bottom-right"].bottom,
  };
  for (const box of boxes) {
    const area = bounds[box.corner];
    const left = box.corner.endsWith("left") ? area.left : area.right - box.width;
    if (box.corner.startsWith("top")) {
      const top = cursor[box.corner];
      if (top + box.height > area.bottom) continue;
      parts.push(box.svg(left, top));
      cursor[box.corner] = top + box.height + area.gap;
      topBottom = Math.max(topBottom, top + box.height);
    } else {
      const top = cursor[box.corner] - box.height;
      if (top < area.top) continue;
      parts.push(box.svg(left, top));
      cursor[box.corner] = top - area.gap;
      bottomTop = Math.min(bottomTop, top);
    }
  }
  return { svg: parts.join(""), topBottom, bottomTop };
}
