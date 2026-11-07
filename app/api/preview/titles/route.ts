import { NextResponse } from "next/server";

import { runWithClientRequestContext } from "@/lib/client-request-context";
import { fetchPreviewTitles } from "@/lib/preview-titles";
import { tmdbCredentialFromRaw } from "@/lib/tmdb-credential-infer";
import { serverTmdbCredential, type TmdbCredential } from "@/lib/tmdb-server-credential";

export const runtime = "nodejs";

const BROWSER_CACHE_MAX_AGE_SEC = 60 * 60;

async function titlesResponse(request: Request, credential: TmdbCredential | null) {
  if (!credential) return NextResponse.json({ titles: [] }, { status: 404 });
  try {
    const titles = await runWithClientRequestContext(request, () => fetchPreviewTitles(credential));
    return NextResponse.json(
      { titles },
      { headers: { "Cache-Control": `private, max-age=${BROWSER_CACHE_MAX_AGE_SEC}` } },
    );
  } catch {
    return NextResponse.json({ titles: [] }, { status: 502 });
  }
}

export async function GET(request: Request) {
  return titlesResponse(request, serverTmdbCredential());
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
