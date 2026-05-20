import type { RatingSource } from "@/lib/ratings";

export function ratingDisplayColor(source: RatingSource, valueTen: number): string {
  if (!Number.isFinite(valueTen)) return "#f5f5f5";

  if (source === "tomatoes" || source === "tomatoesaudience") {
    return valueTen >= 6 ? "#14ae5c" : "#fa320a";
  }

  if (source === "metacritic" || source === "metacriticuser") {
    if (valueTen >= 7.5) return "#6bb83a";
    if (valueTen >= 5) return "#ffbd3f";
    return "#ff5d4d";
  }

  if (source === "letterboxd") {
    if (valueTen >= 7) return "#00e054";
    if (valueTen >= 6) return "#6ac045";
    if (valueTen >= 5) return "#d4900d";
    return "#db4437";
  }

  if (valueTen >= 7.5) return "#46d369";
  if (valueTen >= 6) return "#dbc02c";
  if (valueTen >= 4) return "#e67e22";
  return "#e74c3c";
}
