import { NextResponse } from "next/server";

import { checkConfigPassword, issueConfigureSessionToken } from "@/lib/polis-config-api-auth";
import { configureSessionCookieHeader } from "@/lib/polis-config-auth";
import { isValidPolisConfigId } from "@/lib/polis-config-id";
import { getPolisConfig } from "@/lib/polis-config-store";
import { readJsonBody, SMALL_JSON_BODY_MAX_BYTES } from "@/lib/request-json-body";

export const runtime = "nodejs";

type UnlockBody = { password?: string };

export async function POST(
  request: Request,
  { params }: { params: Promise<{ configId: string }> },
) {
  const { configId } = await params;
  if (!isValidPolisConfigId(configId)) {
    return NextResponse.json({ error: "Invalid config id" }, { status: 400 });
  }

  const config = getPolisConfig(configId);
  if (!config) {
    return NextResponse.json({ error: "Config not found" }, { status: 404 });
  }

  if (!config.hasPassword) {
    const token = issueConfigureSessionToken(configId);
    return NextResponse.json(
      { ok: true, authenticated: true },
      { headers: { "Set-Cookie": configureSessionCookieHeader(token) } },
    );
  }

  const parsed = await readJsonBody(request, SMALL_JSON_BODY_MAX_BYTES);
  if (!parsed.ok) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: parsed.status });
  }
  const body = (parsed.value ?? {}) as UnlockBody;

  const password = typeof body.password === "string" ? body.password.trim() : "";
  if (!password) {
    return NextResponse.json({ error: "Password is required." }, { status: 400 });
  }

  const check = await checkConfigPassword(configId, password);
  if (!check.ok) {
    const headers: HeadersInit =
      check.status === 429 ? { "Retry-After": String(check.retryAfterSeconds) } : {};
    return NextResponse.json({ error: check.error }, { status: check.status, headers });
  }

  const token = issueConfigureSessionToken(configId);
  return NextResponse.json(
    { ok: true, authenticated: true },
    { headers: { "Set-Cookie": configureSessionCookieHeader(token) } },
  );
}
