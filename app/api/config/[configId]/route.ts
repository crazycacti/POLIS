import { NextResponse } from "next/server";

import { getPolisConfig } from "@/lib/polis-config-store";
import { isValidPolisConfigId } from "@/lib/polis-config-id";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
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

  return NextResponse.json({
    configId: config.id,
    label: config.label,
    posterQuery: config.posterQuery,
    manifestKind: config.manifestKind,
    catalogs: config.catalogs,
    hasPassword: config.hasPassword,
    hasTmdbIntegrator: Boolean(config.tmdbIntegratorSecret),
    hasMdblistIntegrator: Boolean(config.mdblistIntegratorKey),
    createdAt: config.createdAt,
    updatedAt: config.updatedAt,
  });
}
