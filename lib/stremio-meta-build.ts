import { mergePosterQueryWithIntegratorAuth } from "@/lib/integrator-auth";
import { defaultPosterQueryString, parsePosterOverlayQuery } from "@/lib/poster-query";
import { backdropArtUrl, logoArtUrl, posterArtUrl } from "@/lib/polis-urls";
import type { StremioMetaVideo } from "@/lib/tmdb-series-videos";
import type { ResolvedTitle } from "@/lib/tmdb-resolve";

function formatRuntimeLabel(minutes: number | null): string | undefined {
  if (minutes == null || minutes <= 0) return undefined;
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function formatRating(voteAverage: number | null): string | undefined {
  if (voteAverage == null || voteAverage <= 0) return undefined;
  return voteAverage.toFixed(1);
}

type StremioMetaLink = {
  name: string;
  category: string;
  url: string;
};

function imdbMetaLink(imdbId: string): StremioMetaLink {
  return {
    name: imdbId,
    category: "imdb",
    url: `https://www.imdb.com/title/${imdbId}/`,
  };
}

function searchMetaLink(name: string, category: string): StremioMetaLink {
  return {
    name,
    category,
    url: `stremio:///search?search=${encodeURIComponent(name)}`,
  };
}

function buildMetaLinks(resolved: ResolvedTitle): StremioMetaLink[] {
  const links: StremioMetaLink[] = [imdbMetaLink(resolved.imdbId)];

  for (const name of resolved.directors) {
    links.push(searchMetaLink(name, "director"));
  }

  for (const name of resolved.cast) {
    links.push(searchMetaLink(name, "cast"));
  }

  for (const genre of resolved.genreNames) {
    links.push(searchMetaLink(genre, "genres"));
  }

  return links;
}

export function buildStremioMetaRecord(
  resolved: ResolvedTitle,
  publicBase: string,
  artworkAuth: URLSearchParams | undefined,
  posterQueryString: string | undefined,
  configId?: string | null,
): Record<string, unknown> {
  const qs = mergePosterQueryWithIntegratorAuth(
    posterQueryString?.trim() || defaultPosterQueryString(),
    artworkAuth,
  );
  const overlay = parsePosterOverlayQuery(new URLSearchParams(qs));

  const out: Record<string, unknown> = {
    id: resolved.imdbId,
    imdb_id: resolved.imdbId,
    type: resolved.stremioType === "movie" ? "movie" : "series",
    name: resolved.title,
    description: resolved.overview || undefined,
    posterShape: "poster",
  };

  if (resolved.releaseInfo) {
    out.releaseInfo = resolved.releaseInfo;
  } else if (resolved.releaseYear) {
    out.releaseInfo = resolved.releaseYear;
  }

  if (resolved.releasedIso) {
    out.released = resolved.releasedIso;
  }

  if (resolved.genreNames.length > 0) {
    out.genres = resolved.genreNames;
  }

  const rating = formatRating(resolved.voteAverage);
  if (rating) {
    out.imdbRating = rating;
  }

  const runtime = formatRuntimeLabel(resolved.runtimeMinutes);
  if (runtime) {
    out.runtime = runtime;
  }

  if (resolved.directors.length > 0) {
    out.director = resolved.directors;
  }

  if (resolved.cast.length > 0) {
    out.cast = resolved.cast;
  }

  if (resolved.country) {
    out.country = resolved.country;
  }

  if (resolved.tmdbNumericId > 0) {
    out.moviedb_id = resolved.tmdbNumericId;
  }

  if (resolved.tvdbId != null) {
    out.tvdb_id = resolved.tvdbId;
  }

  out.links = buildMetaLinks(resolved);

  if (resolved.posterPath) {
    out.poster = posterArtUrl({
      publicBase,
      imdbId: resolved.imdbId,
      query: qs,
      configId,
    });
  }

  if (resolved.backdropPath) {
    out.background = backdropArtUrl(publicBase, resolved.imdbId, configId);
  }

  if (resolved.logoPath && !overlay.logoOnPoster) {
    out.logo = logoArtUrl(publicBase, resolved.imdbId, configId);
  }

  if (resolved.stremioType === "series" && resolved.videos && resolved.videos.length > 0) {
    out.videos = resolved.videos.map((video: StremioMetaVideo) => ({
      id: video.id,
      title: video.title,
      released: video.released,
      season: video.season,
      episode: video.episode,
      overview: video.overview,
      thumbnail: video.thumbnail,
    }));
  }

  return out;
}
