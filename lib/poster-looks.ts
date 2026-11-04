import type { PosterOverlayQuery } from "@/lib/poster-query";

type LookFields = Pick<
  PosterOverlayQuery,
  "look" | "genre" | "rating" | "trendTags" | "qualityTags" | "ageRating" | "logoOnPoster"
>;

export type StarterLook = { id: string; label: string; fields: LookFields };

export const STARTER_LOOKS: StarterLook[] = [
  {
    id: "clean",
    label: "Clean",
    fields: { look: "soft", genre: false, rating: true, trendTags: true, qualityTags: false, ageRating: false, logoOnPoster: true },
  },
  {
    id: "score",
    label: "Score only",
    fields: { look: "soft", genre: false, rating: true, trendTags: false, qualityTags: false, ageRating: false, logoOnPoster: true },
  },
  {
    id: "detailed",
    label: "Detailed",
    fields: { look: "soft", genre: true, rating: true, trendTags: true, qualityTags: true, ageRating: true, logoOnPoster: true },
  },
  {
    id: "classic",
    label: "Classic",
    fields: { look: "classic", genre: true, rating: true, trendTags: true, qualityTags: false, ageRating: false, logoOnPoster: true },
  },
];

export function applyStarterLook(overlay: PosterOverlayQuery, look: StarterLook): PosterOverlayQuery {
  return { ...overlay, ...look.fields };
}

export function matchesStarterLook(overlay: PosterOverlayQuery, look: StarterLook): boolean {
  return (Object.keys(look.fields) as (keyof LookFields)[]).every(
    (key) => overlay[key] === look.fields[key],
  );
}
