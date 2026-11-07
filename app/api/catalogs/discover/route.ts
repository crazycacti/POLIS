import { NextResponse } from "next/server";

import { proxyClientKey } from "@/lib/client-request-context";
import { MDBLIST_WATCHLIST_PRESETS, TMDB_CATALOG_PRESETS } from "@/lib/catalog-presets";
import {
  fetchMdblistOwnLists,
  fetchMdblistUserListsByUsername,
  searchMdblistLists,
} from "@/lib/mdblist-lists";
import { polisEnvPositiveInt } from "@/lib/polis-env-int";
import { readJsonBody, SMALL_JSON_BODY_MAX_BYTES } from "@/lib/request-json-body";
import { SlidingWindowLimiter } from "@/lib/sliding-window-limiter";

export const runtime = "nodejs";

const DISCOVER_SERVER_KEY_PROFILE = "list-search";
const DEFAULT_DISCOVERS_PER_CLIENT_PER_MIN = 10;

const discovers = new SlidingWindowLimiter(
  60 * 1000,
  () => polisEnvPositiveInt("POLIS_LIST_DISCOVERS_PER_CLIENT_PER_MIN") ?? DEFAULT_DISCOVERS_PER_CLIENT_PER_MIN,
);

type DiscoverBody = {
  mdblistApiKey?: string;
  username?: string;
  search?: string;
};

export async function POST(request: Request) {
  const clientKey = proxyClientKey(request);
  if (!discovers.take(clientKey)) {
    return NextResponse.json(
      { error: "Too many list searches. Try again in a minute." },
      { status: 429, headers: { "Retry-After": String(discovers.retryAfterSec(clientKey)) } },
    );
  }

  const parsed = await readJsonBody(request, SMALL_JSON_BODY_MAX_BYTES);
  if (!parsed.ok) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: parsed.status });
  }
  const body = (parsed.value ?? {}) as DiscoverBody;

  const callerKey = typeof body.mdblistApiKey === "string" ? body.mdblistApiKey.trim() : "";
  const serverKey = process.env.MDBLIST_API_KEY?.trim() || "";
  const mdblistKey = callerKey || serverKey;
  const listsOptions = callerKey ? {} : { serverKeyProfile: DISCOVER_SERVER_KEY_PROFILE };
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
    if (search) {
      response.mdblistLists = await searchMdblistLists(search, mdblistKey, listsOptions);
    } else if (username) {
      response.mdblistLists = await fetchMdblistUserListsByUsername(username, mdblistKey, listsOptions);
    } else if (callerKey) {
      response.mdblistLists = await fetchMdblistOwnLists(callerKey);
    } else {
      response.error = "Add your MDBList key under API keys to load your lists.";
    }
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
