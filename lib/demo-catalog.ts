import type { QualityMarkId } from "@/lib/poster-quality-marks";
import type { RatingSource } from "@/lib/ratings";
import { pickRatingDisplay, type RatingScores } from "@/lib/ratings";

export type DemoTitle = {
  id: string;
  imdbId: string;
  title: string;
  artFile: string;
  artTextless: boolean;
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
    artTextless: true,
    genreNames: ["Science Fiction", "Adventure"],
    voteAverage: 8.1,
    ratings: { imdb: 8.4, tomatoes: 9.2, metacritic: 7.9, tmdb: 8.1 },
    qualityMarkIds: ["dolby", "4k"],
    trendText: "Oscar Winner",
    ageLabel: "PG-13",
  },
  {
    id: "shogun",
    imdbId: "tt2788316",
    title: "Shōgun",
    artFile: "shogun.jpg",
    artTextless: true,
    genreNames: ["Drama", "History"],
    voteAverage: 8.4,
    ratings: { imdb: 8.6, tomatoes: 9.9, metacritic: 8.5, tmdb: 8.4 },
    qualityMarkIds: ["dolby", "4k"],
    trendText: "Emmy Winner",
    ageLabel: "TV-MA",
  },
  {
    id: "fallout",
    imdbId: "tt12637874",
    title: "Fallout",
    artFile: "fallout.jpg",
    artTextless: true,
    genreNames: ["Action", "Science Fiction"],
    voteAverage: 8.1,
    ratings: { imdb: 8.3, tomatoes: 9.4, metacritic: 7.3, tmdb: 8.1 },
    qualityMarkIds: ["dolby", "4k"],
    trendText: "Certified Fresh",
    ageLabel: "TV-MA",
  },
  {
    id: "penguin",
    imdbId: "tt15435876",
    title: "The Penguin",
    artFile: "penguin.jpg",
    artTextless: true,
    genreNames: ["Crime", "Drama"],
    voteAverage: 8.3,
    ratings: { imdb: 8.6, tomatoes: 9.5, metacritic: 7.2, tmdb: 8.3 },
    qualityMarkIds: ["1080p", "dolby"],
    trendText: "Certified Fresh",
    ageLabel: "TV-MA",
  },
  {
    id: "wicked",
    imdbId: "tt1262426",
    title: "Wicked",
    artFile: "wicked.jpg",
    artTextless: true,
    genreNames: ["Fantasy", "Musical"],
    voteAverage: 6.9,
    ratings: { imdb: 7.3, tomatoes: 8.8, metacritic: 7.3, tmdb: 6.9 },
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
