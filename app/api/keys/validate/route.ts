import { NextResponse } from "next/server";

import {
  validateApiKey,
  type ApiKeyProvider,
} from "@/lib/api-key-validate";
import { runWithClientRequestContext } from "@/lib/client-request-context";

export const runtime = "nodejs";

const PROVIDERS: ApiKeyProvider[] = ["tmdb", "mdblist", "fanart", "tvdb"];

export async function POST(request: Request) {
  let body: { provider?: string; key?: string };
  try {
    body = (await request.json()) as { provider?: string; key?: string };
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid JSON body" }, { status: 400 });
  }

  const provider = body.provider?.trim().toLowerCase() as ApiKeyProvider;
  if (!PROVIDERS.includes(provider)) {
    return NextResponse.json({ ok: false, message: "Unknown provider" }, { status: 400 });
  }

  const key = body.key?.trim() ?? "";
  if (!key) {
    return NextResponse.json({ ok: false, message: "Key is empty" }, { status: 400 });
  }

  const result = await runWithClientRequestContext(request, () => validateApiKey(provider, key));
  return NextResponse.json(result, { status: result.ok ? 200 : 422 });
}
