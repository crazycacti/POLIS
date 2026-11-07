import { NextResponse } from "next/server";

import {
  validateApiKey,
  type ApiKeyProvider,
} from "@/lib/api-key-validate";
import { proxyClientKey } from "@/lib/client-request-context";
import { polisEnvPositiveInt } from "@/lib/polis-env-int";
import { readJsonBody, SMALL_JSON_BODY_MAX_BYTES } from "@/lib/request-json-body";
import { SlidingWindowLimiter } from "@/lib/sliding-window-limiter";

export const runtime = "nodejs";

const PROVIDERS: ApiKeyProvider[] = ["tmdb", "mdblist", "fanart", "tvdb"];
const VALIDATION_WINDOW_MS = 60 * 1000;
const DEFAULT_VALIDATIONS_PER_CLIENT_PER_MIN = 20;

const validations = new SlidingWindowLimiter(
  VALIDATION_WINDOW_MS,
  () => polisEnvPositiveInt("POLIS_KEY_VALIDATIONS_PER_CLIENT_PER_MIN") ?? DEFAULT_VALIDATIONS_PER_CLIENT_PER_MIN,
);

export async function POST(request: Request) {
  const clientKey = proxyClientKey(request);
  if (!validations.take(clientKey)) {
    return NextResponse.json(
      { ok: false, message: "Too many key checks. Try again in a minute." },
      { status: 429, headers: { "Retry-After": String(validations.retryAfterSec(clientKey)) } },
    );
  }

  const parsed = await readJsonBody(request, SMALL_JSON_BODY_MAX_BYTES);
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, message: "Invalid JSON body" }, { status: parsed.status });
  }
  const body = (parsed.value ?? {}) as { provider?: unknown; key?: unknown };

  const provider = (typeof body.provider === "string" ? body.provider.trim().toLowerCase() : "") as ApiKeyProvider;
  if (!PROVIDERS.includes(provider)) {
    return NextResponse.json({ ok: false, message: "Unknown provider" }, { status: 400 });
  }

  const key = typeof body.key === "string" ? body.key.trim() : "";
  if (!key) {
    return NextResponse.json({ ok: false, message: "Key is empty" }, { status: 400 });
  }

  const result = await validateApiKey(provider, key);
  return NextResponse.json(result, { status: result.ok ? 200 : 422 });
}
