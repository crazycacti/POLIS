import type { PosterOverlayQuery } from "@/lib/poster-query";

export function overlayUsesMdblist(overlay: PosterOverlayQuery): boolean {
  if (overlay.trendTags || overlay.qualityTags || overlay.ageRating) return true;
  if (!overlay.rating) return false;
  return overlay.ratingSource !== "tmdb";
}

export function hasMdblistCredential(
  serverKey: boolean,
  browserKey: string | null | undefined,
): boolean {
  return serverKey || Boolean(browserKey?.trim());
}
