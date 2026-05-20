import { NextResponse } from "next/server";

import { runWithClientRequestContext } from "@/lib/client-request-context";
import { MDBLIST_WATCHLIST_PRESETS, TMDB_CATALOG_PRESETS } from "@/lib/catalog-presets";
import {
  fetchMdblistOwnLists,
  fetchMdblistUserListsByUsername,
  searchMdblistLists,
} from "@/lib/mdblist-lists";

export const runtime = "nodejs";

type DiscoverBody = {
  mdblistApiKey?: string;
  username?: string;
  search?: string;
};

export async function POST(request: Request) {
  let body: DiscoverBody;
  try {
    body = (await request.json()) as DiscoverBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const mdblistKey =
    body.mdblistApiKey?.trim() || process.env.MDBLIST_API_KEY?.trim() || "";
  const hasServerTmdb = Boolean(
    process.env.TMDB_ACCESS_TOKEN?.trim() || process.env.TMDB_API_KEY?.trim(),
  );

  const response: {
    tmdbPresets: typeof TMDB_CATALOG_PRESETS;
    mdblistWatchlistPresets: typeof MDBLIST_WATCHLIST_PRESETS;
    mdblistLists: Awaited<ReturnType<typeof fetchMdblistUserListsByUsername>>;
    error?: string;
  } = {
    tmdbPresets: TMDB_CATALOG_PRESETS,
    mdblistWatchlistPresets: MDBLIST_WATCHLIST_PRESETS,
    mdblistLists: [],
  };

  if (!mdblistKey) {
    return NextResponse.json({
      ...response,
      hasServerTmdb,
      mdblistAvailable: false,
    });
  }

  try {
    const search = body.search?.trim();
    const username = body.username?.trim();
    await runWithClientRequestContext(request, async () => {
      if (search) {
        response.mdblistLists = await searchMdblistLists(search, mdblistKey);
      } else if (username) {
        response.mdblistLists = await fetchMdblistUserListsByUsername(username, mdblistKey);
      } else {
        response.mdblistLists = await fetchMdblistOwnLists(mdblistKey);
      }
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "MDBList request failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  return NextResponse.json({
    ...response,
    hasServerTmdb,
    mdblistAvailable: true,
  });
}
