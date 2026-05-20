import { NextResponse } from "next/server";

import {
  configureSessionCookieHeader,
  createConfigureSessionToken,
  verifyConfigPassword,
} from "@/lib/polis-config-auth";
import { isValidPolisConfigId } from "@/lib/polis-config-id";
import { getConfigPasswordHash, getPolisConfig } from "@/lib/polis-config-store";

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
    const token = createConfigureSessionToken(configId);
    return NextResponse.json(
      { ok: true, authenticated: true },
      { headers: { "Set-Cookie": configureSessionCookieHeader(token) } },
    );
  }

  let body: UnlockBody;
  try {
    body = (await request.json()) as UnlockBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const password = typeof body.password === "string" ? body.password.trim() : "";
  if (!password) {
    return NextResponse.json({ error: "Password is required." }, { status: 400 });
  }

  const hash = getConfigPasswordHash(configId);
  const valid = await verifyConfigPassword(password, hash);
  if (!valid) {
    return NextResponse.json({ error: "Invalid password." }, { status: 401 });
  }

  const token = createConfigureSessionToken(configId);
  return NextResponse.json(
    { ok: true, authenticated: true },
    { headers: { "Set-Cookie": configureSessionCookieHeader(token) } },
  );
}
