import type { QualityMarkId } from "@/lib/poster-quality-marks";
import type { RatingSource } from "@/lib/ratings";
import { pickRatingDisplay, type RatingScores } from "@/lib/ratings";

export type DemoTitle = {
  id: string;
  imdbId: string;
  title: string;
  artFile: string;
  genreNames: string[];
  voteAverage: number;
  ratings: RatingScores;
  qualityMarkIds: QualityMarkId[];
  trendText: string | null;
  ageLabel: string | null;
};

export const DEMO_TITLES: DemoTitle[] = [
  {
    id: "dune-part-two",
    imdbId: "tt15239678",
    title: "Dune: Part Two",
    artFile: "dune-part-two.jpg",
    genreNames: ["Science Fiction", "Adventure"],
    voteAverage: 8.2,
    ratings: { imdb: 8.5, tomatoes: 92, metacritic: 79, tmdb: 8.2 },
    qualityMarkIds: ["dolby", "4k"],
    trendText: "Oscar Winner",
    ageLabel: "PG-13",
  },
  {
    id: "shogun",
    imdbId: "tt27883186",
    title: "Shōgun",
    artFile: "shogun.jpg",
    genreNames: ["Drama", "History"],
    voteAverage: 8.5,
    ratings: { imdb: 8.6, tomatoes: 99, metacritic: 80, tmdb: 8.5 },
    qualityMarkIds: ["dolby", "4k"],
    trendText: "Emmy Winner",
    ageLabel: "TV-MA",
  },
  {
    id: "fallout",
    imdbId: "tt12637874",
    title: "Fallout",
    artFile: "fallout.jpg",
    genreNames: ["Action", "Science Fiction"],
    voteAverage: 8.4,
    ratings: { imdb: 8.4, tomatoes: 93, metacritic: 73, tmdb: 8.4 },
    qualityMarkIds: ["dolby", "4k"],
    trendText: "Certified Fresh",
    ageLabel: "TV-MA",
  },
  {
    id: "penguin",
    imdbId: "tt21653760",
    title: "The Penguin",
    artFile: "penguin.jpg",
    genreNames: ["Crime", "Drama"],
    voteAverage: 8.7,
    ratings: { imdb: 8.7, tomatoes: 93, metacritic: 76, tmdb: 8.7 },
    qualityMarkIds: ["1080p", "dolby"],
    trendText: "Certified Fresh",
    ageLabel: "TV-MA",
  },
  {
    id: "wicked",
    imdbId: "tt12653420",
    title: "Wicked",
    artFile: "wicked.jpg",
    genreNames: ["Fantasy", "Musical"],
    voteAverage: 7.5,
    ratings: { imdb: 7.5, tomatoes: 88, metacritic: 73, tmdb: 7.5 },
    qualityMarkIds: ["dolby", "4k"],
    trendText: "Box Office Hit",
    ageLabel: "PG",
  },
];

const demoById = new Map(DEMO_TITLES.map((d) => [d.id, d]));

export function getDemoTitle(id: string): DemoTitle | null {
  return demoById.get(id) ?? null;
}

export function demoRatingLabel(
  source: RatingSource,
  demo: DemoTitle,
  style: "min" | "score",
): string | null {
  return pickRatingDisplay(source, demo.ratings, demo.voteAverage, style);
}

export function demoTrendBadges(demo: DemoTitle): { text: string; kind: "trend" }[] {
  if (!demo.trendText) return [];
  return [{ text: demo.trendText, kind: "trend" }];
}
