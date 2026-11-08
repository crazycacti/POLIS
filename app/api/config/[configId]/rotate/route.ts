import { NextResponse } from "next/server";

import { isConfigureSessionValid, issueConfigureSessionToken } from "@/lib/polis-config-api-auth";
import { configureSessionCookieHeader } from "@/lib/polis-config-auth";
import { isValidPolisConfigId } from "@/lib/polis-config-id";
import { getPolisConfig, rotatePolisConfigId } from "@/lib/polis-config-store";

export const runtime = "nodejs";

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
  // Without a password, holding the id is the only proof of ownership, so it cannot authorize moving the profile.
  if (!config.hasPassword) {
    return NextResponse.json({ error: "Set a password first." }, { status: 403 });
  }
  if (!isConfigureSessionValid(request, configId)) {
    return NextResponse.json({ error: "Unlock this profile first." }, { status: 401 });
  }

  const rotated = rotatePolisConfigId(configId);
  if (!rotated) {
    return NextResponse.json({ error: "Config not found" }, { status: 404 });
  }
  return NextResponse.json(
    { configId: rotated.id },
    { headers: { "Set-Cookie": configureSessionCookieHeader(issueConfigureSessionToken(rotated.id)) } },
  );
}
