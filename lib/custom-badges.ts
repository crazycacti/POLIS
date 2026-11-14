import { createHash } from "node:crypto";

import { CUSTOM_BADGE_ICON_NAMES, type CustomBadgeIcon } from "@/lib/custom-badge-icons";

export const CUSTOM_BADGE_CORNERS = ["top-left", "top-right", "bottom-left", "bottom-right"] as const;
export type CustomBadgeCorner = (typeof CUSTOM_BADGE_CORNERS)[number];

export const CUSTOM_BADGE_SHOW_ON = ["all", "movie", "series"] as const;
export type CustomBadgeShowOn = (typeof CUSTOM_BADGE_SHOW_ON)[number];

export type CustomBadge = {
  text: string;
  icon: CustomBadgeIcon | null;
  corner: CustomBadgeCorner;
  color: string;
  background: string;
  showOn: CustomBadgeShowOn;
  minRating: number | null;
};

export const MAX_CUSTOM_BADGES = 4;
export const MAX_CUSTOM_BADGE_TEXT = 20;
export const MAX_CUSTOM_BADGES_PARAM_LENGTH = 1536;
export const CUSTOM_BADGES_PARAM = "cb";
const MIN_RATING_LIMIT = 10;
const FINGERPRINT_LENGTH = 16;
const HEX_COLOR = /^#[0-9a-f]{6}$/;
const UNPRINTABLE = /[\p{C}]/gu;

export const CUSTOM_BADGE_DEFAULTS: CustomBadge = {
  text: "",
  icon: null,
  corner: "top-left",
  color: "#ffffff",
  background: "#18181b",
  showOn: "all",
  minRating: null,
};

export function normalizeCustomBadgeText(raw: string): string {
  const cleaned = raw.normalize("NFC").replace(UNPRINTABLE, " ").replace(/\s+/g, " ").trim();
  return Array.from(cleaned).slice(0, MAX_CUSTOM_BADGE_TEXT).join("").trim();
}

function oneOf<T extends string>(values: readonly T[], raw: unknown): T | null {
  return typeof raw === "string" && (values as readonly string[]).includes(raw) ? (raw as T) : null;
}

function hexColor(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const lower = raw.trim().toLowerCase();
  return HEX_COLOR.test(lower) ? lower : null;
}

function parseOne(raw: unknown): CustomBadge | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  if (row.text !== undefined && typeof row.text !== "string") return null;
  const text = normalizeCustomBadgeText(typeof row.text === "string" ? row.text : "");
  const icon = row.icon == null ? null : oneOf(CUSTOM_BADGE_ICON_NAMES, row.icon);
  if (row.icon != null && icon == null) return null;
  if (!text && !icon) return null;
  const corner = oneOf(CUSTOM_BADGE_CORNERS, row.corner);
  const color = hexColor(row.color);
  const background = hexColor(row.background);
  const showOn = row.showOn === undefined ? "all" : oneOf(CUSTOM_BADGE_SHOW_ON, row.showOn);
  if (!corner || !color || !background || !showOn) return null;
  let minRating: number | null = null;
  if (row.minRating != null) {
    if (typeof row.minRating !== "number" || !Number.isFinite(row.minRating)) return null;
    if (row.minRating < 0 || row.minRating > MIN_RATING_LIMIT) return null;
    minRating = Math.round(row.minRating * 10) / 10;
  }
  return { text, icon, corner, color, background, showOn, minRating };
}

export function parseCustomBadges(raw: unknown): CustomBadge[] | null {
  if (raw == null) return [];
  if (!Array.isArray(raw) || raw.length > MAX_CUSTOM_BADGES) return null;
  const out: CustomBadge[] = [];
  for (const row of raw) {
    const badge = parseOne(row);
    if (!badge) return null;
    out.push(badge);
  }
  return out;
}

export function parseStoredCustomBadges(json: string | null | undefined): CustomBadge[] {
  if (!json) return [];
  try {
    return parseCustomBadges(JSON.parse(json)) ?? [];
  } catch {
    return [];
  }
}

export function serializeCustomBadges(badges: CustomBadge[]): string {
  return JSON.stringify(
    badges.map((b) => ({
      text: b.text,
      icon: b.icon,
      corner: b.corner,
      color: b.color,
      background: b.background,
      showOn: b.showOn,
      minRating: b.minRating,
    })),
  );
}

export function customBadgesFingerprint(badges: CustomBadge[]): string {
  if (badges.length === 0) return "";
  return createHash("sha256").update(serializeCustomBadges(badges)).digest("hex").slice(0, FINGERPRINT_LENGTH);
}

export function encodeCustomBadgesParam(badges: CustomBadge[]): string {
  return badges.length === 0 ? "" : Buffer.from(serializeCustomBadges(badges), "utf8").toString("base64url");
}

export function decodeCustomBadgesParam(raw: string | null): CustomBadge[] {
  if (!raw || raw.length > MAX_CUSTOM_BADGES_PARAM_LENGTH) return [];
  try {
    return parseCustomBadges(JSON.parse(Buffer.from(raw, "base64url").toString("utf8"))) ?? [];
  } catch {
    return [];
  }
}

export function customBadgesForTitle(
  badges: CustomBadge[],
  title: { stremioType: "movie" | "series"; ratingValueTen: number | null },
): CustomBadge[] {
  return badges.filter((badge) => {
    if (badge.showOn !== "all" && badge.showOn !== title.stremioType) return false;
    if (badge.minRating != null && (title.ratingValueTen == null || title.ratingValueTen < badge.minRating)) {
      return false;
    }
    return true;
  });
}
