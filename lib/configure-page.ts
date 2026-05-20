import { headers } from "next/headers";

import {
  pickDefaultArtworkMovieSource,
  pickDefaultArtworkSource,
} from "@/lib/artwork-defaults";
import { configureInitialPosterOverlay } from "@/lib/poster-query";

export type ConfigurePageServerProps = {
  initialOrigin: string;
  hasServerTmdb: boolean;
  hasServerMdblist: boolean;
  hasServerFanart: boolean;
  hasServerTvdb: boolean;
  initialOverlay: ReturnType<typeof configureInitialPosterOverlay>;
};

export async function loadConfigurePageServerProps(): Promise<ConfigurePageServerProps> {
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const forwardedHost = h.get("x-forwarded-host");
  const host = forwardedHost ?? h.get("host") ?? "";
  const requestOrigin = host ? `${proto}://${host}` : "";
  const envOrigin = process.env.POLIS_PUBLIC_URL?.trim().replace(/\/$/, "") ?? "";
  const initialOrigin = envOrigin || requestOrigin;
  const hasServerTmdb = Boolean(
    process.env.TMDB_ACCESS_TOKEN?.trim() || process.env.TMDB_API_KEY?.trim(),
  );
  const hasServerMdblist = Boolean(process.env.MDBLIST_API_KEY?.trim());
  const hasServerFanart = Boolean(process.env.FANART_API_KEY?.trim());
  const hasServerTvdb = Boolean(process.env.TVDB_API_KEY?.trim());
  const keyAvailability = {
    hasTmdb: hasServerTmdb,
    hasFanart: hasServerFanart,
    hasTvdb: hasServerTvdb,
  };
  const initialOverlay = configureInitialPosterOverlay({
    artwork: pickDefaultArtworkSource(keyAvailability),
    artworkMovie: pickDefaultArtworkMovieSource(keyAvailability),
    artworkFallback: "metahub",
  });

  return {
    initialOrigin,
    hasServerTmdb,
    hasServerMdblist,
    hasServerFanart,
    hasServerTvdb,
    initialOverlay,
  };
}
