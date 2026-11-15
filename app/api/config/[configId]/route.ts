import { NextResponse } from "next/server";

import { isConfigureSessionValid } from "@/lib/polis-config-api-auth";
import { clearConfigureSessionCookieHeader } from "@/lib/polis-config-auth";
import { deletePolisConfig, getPolisConfig } from "@/lib/polis-config-store";
import { isValidPolisConfigId } from "@/lib/polis-config-id";
import { isSameOriginRequest } from "@/lib/same-origin-request";

export const runtime = "nodejs";

export async function GET(
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
  if (config.hasPassword && !isConfigureSessionValid(request, configId)) {
    return NextResponse.json(
      { error: "Unlock this profile first." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json({
    configId: config.id,
    label: config.label,
    posterQuery: config.posterQuery,
    manifestKind: config.manifestKind,
    catalogs: config.catalogs,
    customBadges: config.customBadges,
    hasPassword: config.hasPassword,
    hasTmdbIntegrator: Boolean(config.tmdbIntegratorSecret),
    hasMdblistIntegrator: Boolean(config.mdblistIntegratorKey),
    createdAt: config.createdAt,
    updatedAt: config.updatedAt,
  });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ configId: string }> },
) {
  const { configId } = await params;
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!isValidPolisConfigId(configId)) {
    return NextResponse.json({ error: "Invalid config id" }, { status: 400 });
  }
  const config = getPolisConfig(configId);
  if (!config) {
    return NextResponse.json({ error: "Config not found" }, { status: 404 });
  }
  // Without a password, holding the id is the only proof of ownership, so it cannot authorize deleting the profile.
  if (!config.hasPassword) {
    return NextResponse.json({ error: "Set a password first." }, { status: 403 });
  }
  if (!isConfigureSessionValid(request, configId)) {
    return NextResponse.json({ error: "Unlock this profile first." }, { status: 401 });
  }
  if (!deletePolisConfig(configId)) {
    return NextResponse.json({ error: "Config not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true }, { headers: { "Set-Cookie": clearConfigureSessionCookieHeader() } });
}
