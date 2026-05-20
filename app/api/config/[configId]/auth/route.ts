import { NextResponse } from "next/server";

import { isConfigureSessionValid } from "@/lib/polis-config-api-auth";
import { isValidPolisConfigId } from "@/lib/polis-config-id";
import { getPolisConfig } from "@/lib/polis-config-store";

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

  return NextResponse.json({
    configId: config.id,
    hasPassword: config.hasPassword,
    authenticated: config.hasPassword ? isConfigureSessionValid(request, configId) : true,
  });
}
