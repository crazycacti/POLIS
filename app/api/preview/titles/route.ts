import { NextResponse } from "next/server";

import { runWithClientRequestContext } from "@/lib/client-request-context";
import { fetchPreviewTitles, readCachedPreviewTitles } from "@/lib/preview-titles";
import { cleanPreviewKey, NO_PREVIEW_CALLER_KEYS, type PreviewCallerKeys } from "@/lib/preview-keys";
import type { PreviewTitle } from "@/lib/preview-title-list";
import { warmPreviewPosters } from "@/lib/preview-warmup";
import { tmdbCredentialFromRaw } from "@/lib/tmdb-credential-infer";
import { serverTmdbCredential, type TmdbCredential } from "@/lib/tmdb-server-credential";

export const runtime = "nodejs";

const BROWSER_CACHE_MAX_AGE_SEC = 60 * 60;

function titlesOk(titles: PreviewTitle[]) {
  return NextResponse.json(
    { titles },
    { headers: { "Cache-Control": `private, max-age=${BROWSER_CACHE_MAX_AGE_SEC}` } },
  );
}

async function titlesResponse(request: Request, credential: TmdbCredential | null, warmKeys: PreviewCallerKeys) {
  if (!credential) return NextResponse.json({ titles: [] }, { status: 404 });
  try {
    const titles = await runWithClientRequestContext(request, () => fetchPreviewTitles(credential));
    void warmPreviewPosters(titles, warmKeys);
    return titlesOk(titles);
  } catch {
    return NextResponse.json({ titles: [] }, { status: 502 });
  }
}

export async function GET(request: Request) {
  const server = serverTmdbCredential();
  if (server) return titlesResponse(request, server, NO_PREVIEW_CALLER_KEYS);
  const cached = await readCachedPreviewTitles();
  if (!cached) {
    return NextResponse.json({ titles: [] }, { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  return titlesOk(cached);
}

type TitlesBody = { tmdbKey?: unknown; mdblistKey?: unknown; fanartKey?: unknown; tvdbKey?: unknown };

export async function POST(request: Request) {
  let body: TitlesBody;
  try {
    body = (await request.json()) as TitlesBody;
  } catch {
    return NextResponse.json({ titles: [] }, { status: 400 });
  }
  const callerKey = cleanPreviewKey(body.tmdbKey);
  const credential = serverTmdbCredential() ?? (callerKey ? tmdbCredentialFromRaw(callerKey) : null);
  return titlesResponse(request, credential, {
    tmdb: callerKey,
    mdblist: cleanPreviewKey(body.mdblistKey),
    fanart: cleanPreviewKey(body.fanartKey),
    tvdb: cleanPreviewKey(body.tvdbKey),
  });
}
