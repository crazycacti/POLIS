import { NextResponse } from "next/server";

import { runWithClientRequestContext } from "@/lib/client-request-context";
import { fetchPreviewTitles, readCachedPreviewTitles } from "@/lib/preview-titles";
import type { PreviewTitle } from "@/lib/preview-title-list";
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

async function titlesResponse(request: Request, credential: TmdbCredential | null) {
  if (!credential) return NextResponse.json({ titles: [] }, { status: 404 });
  try {
    const titles = await runWithClientRequestContext(request, () => fetchPreviewTitles(credential));
    return titlesOk(titles);
  } catch {
    return NextResponse.json({ titles: [] }, { status: 502 });
  }
}

export async function GET(request: Request) {
  const server = serverTmdbCredential();
  if (server) return titlesResponse(request, server);
  const cached = await readCachedPreviewTitles();
  if (!cached) {
    return NextResponse.json({ titles: [] }, { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  return titlesOk(cached);
}

export async function POST(request: Request) {
  let body: { tmdbKey?: unknown };
  try {
    body = (await request.json()) as { tmdbKey?: unknown };
  } catch {
    return NextResponse.json({ titles: [] }, { status: 400 });
  }
  const callerKey = typeof body.tmdbKey === "string" ? body.tmdbKey.trim() : "";
  const credential = serverTmdbCredential() ?? (callerKey ? tmdbCredentialFromRaw(callerKey) : null);
  return titlesResponse(request, credential);
}
