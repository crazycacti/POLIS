import { NextResponse } from "next/server";

import type { PolisCatalogDefinition } from "@/lib/polis-catalogs";
import { parsePolisCatalogDefinition } from "@/lib/polis-catalogs-json";
import {
  authorizeConfigWrite,
} from "@/lib/polis-config-api-auth";
import {
  configureSessionCookieHeader,
  createConfigureSessionToken,
  hashConfigPassword,
  validateNewPasswordPair,
} from "@/lib/polis-config-auth";
import { isValidPolisConfigId } from "@/lib/polis-config-id";
import {
  createPolisConfig,
  getPolisConfig,
  updatePolisConfig,
  type PolisConfigIntegratorPatch,
  type StoredPolisConfig,
} from "@/lib/polis-config-store";
import { normalizeConfigLabel } from "@/lib/polis-config-label";
import { parsePosterOverlayQuery, serializePosterQuery } from "@/lib/poster-query";
import type { PosterOverlayQuery } from "@/lib/poster-query";

export const runtime = "nodejs";

const MAX_POSTER_QUERY_LEN = 4096;
const MAX_CATALOGS = 32;

type ConfigBody = {
  configId?: string;
  label?: string;
  posterQuery?: string;
  overlay?: PosterOverlayQuery;
  catalogs?: unknown;
  integrator?: {
    tmdbSecret?: string | null;
    mdblistApiKey?: string | null;
  };
  password?: string;
  passwordConfirm?: string;
};

function labelFromBody(body: ConfigBody): string | undefined | null {
  if (body.label === undefined) return undefined;
  if (typeof body.label !== "string") return null;
  const trimmed = body.label.trim();
  if (!trimmed) return undefined;
  return normalizeConfigLabel(trimmed);
}

function posterQueryFromBody(body: ConfigBody): string {
  if (typeof body.posterQuery === "string" && body.posterQuery.trim()) {
    return serializePosterQuery(parsePosterOverlayQuery(new URLSearchParams(body.posterQuery)));
  }
  if (body.overlay && typeof body.overlay === "object") {
    return serializePosterQuery(body.overlay);
  }
  return serializePosterQuery(parsePosterOverlayQuery(new URLSearchParams()));
}

function catalogsFromBody(body: ConfigBody): PolisCatalogDefinition[] | undefined {
  if (!Array.isArray(body.catalogs)) return undefined;
  const out: PolisCatalogDefinition[] = [];
  const seen = new Set<string>();
  for (const row of body.catalogs) {
    const def = parsePolisCatalogDefinition(row);
    if (!def) continue;
    const key = `${def.type}:${def.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(def);
  }
  return out;
}

function integratorFromBody(body: ConfigBody): PolisConfigIntegratorPatch | undefined | null {
  if (!body.integrator || typeof body.integrator !== "object") return undefined;
  const patch: PolisConfigIntegratorPatch = {};
  if (body.integrator.tmdbSecret !== undefined) {
    if (body.integrator.tmdbSecret !== null && typeof body.integrator.tmdbSecret !== "string") {
      return null;
    }
    patch.tmdbSecret = body.integrator.tmdbSecret;
  }
  if (body.integrator.mdblistApiKey !== undefined) {
    if (body.integrator.mdblistApiKey !== null && typeof body.integrator.mdblistApiKey !== "string") {
      return null;
    }
    patch.mdblistApiKey = body.integrator.mdblistApiKey;
  }
  return Object.keys(patch).length > 0 ? patch : undefined;
}

function configResponse(config: StoredPolisConfig) {
  return {
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
  };
}

export async function POST(request: Request) {
  let body: ConfigBody;
  try {
    body = (await request.json()) as ConfigBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const posterQuery = posterQueryFromBody(body);
  if (posterQuery.length > MAX_POSTER_QUERY_LEN) {
    return NextResponse.json({ error: "Poster settings string is too long." }, { status: 400 });
  }
  const overlay = parsePosterOverlayQuery(new URLSearchParams(posterQuery));
  const catalogs = catalogsFromBody(body);
  if (catalogs && catalogs.length > MAX_CATALOGS) {
    return NextResponse.json({ error: `At most ${MAX_CATALOGS} catalogs allowed.` }, { status: 400 });
  }
  const integrator = integratorFromBody(body);
  if (integrator === null) {
    return NextResponse.json({ error: "Invalid integrator key fields." }, { status: 400 });
  }
  const label = labelFromBody(body);
  if (label === null) {
    return NextResponse.json(
      { error: "Profile name must be 1–32 letters, numbers, or spaces." },
      { status: 400 },
    );
  }

  if (body.configId && isValidPolisConfigId(body.configId)) {
    const auth = await authorizeConfigWrite(request, body.configId, body.password);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const existingBefore = getPolisConfig(body.configId);
    if (!existingBefore) {
      return NextResponse.json({ error: "Config not found" }, { status: 404 });
    }

    let passwordHash: string | undefined;
    if (!existingBefore.hasPassword) {
      const pair = validateNewPasswordPair(body.password, body.passwordConfirm);
      if (!pair.ok) {
        return NextResponse.json({ error: pair.error }, { status: 400 });
      }
      passwordHash = await hashConfigPassword(pair.password);
    }

    const updated = updatePolisConfig(body.configId, {
      overlay,
      ...(catalogs !== undefined ? { catalogs } : {}),
      ...(integrator !== undefined ? { integrator } : {}),
      ...(label !== undefined ? { label } : {}),
      ...(passwordHash !== undefined ? { passwordHash } : {}),
    });
    if (!updated) {
      return NextResponse.json({ error: "Config not found" }, { status: 404 });
    }

    const headers: HeadersInit = {};
    const token = auth.sessionToken ?? createConfigureSessionToken(body.configId);
    headers["Set-Cookie"] = configureSessionCookieHeader(token);

    return NextResponse.json(configResponse(updated), { headers });
  }

  const pair = validateNewPasswordPair(body.password, body.passwordConfirm);
  if (!pair.ok) {
    return NextResponse.json({ error: pair.error }, { status: 400 });
  }

  const passwordHash = await hashConfigPassword(pair.password);
  const created = createPolisConfig({
    overlay,
    catalogs,
    integrator,
    label,
    passwordHash,
  });

  const token = createConfigureSessionToken(created.id);
  return NextResponse.json(configResponse(created), {
    status: 201,
    headers: { "Set-Cookie": configureSessionCookieHeader(token) },
  });
}
