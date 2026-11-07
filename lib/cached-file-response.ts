import { createHash } from "node:crypto";
import { open } from "node:fs/promises";

import { NextResponse } from "next/server";

const ETAG_HASH_CHARS = 27;
const WEAK_PREFIX = "W/";
const FILE_ETAG_MEMORY_MAX = 10_000;

type FileEtag = { mtimeMs: number; ctimeMs: number; size: number; ino: number; etag: string };

const fileEtags = new Map<string, FileEtag>();

function rememberFileEtag(path: string, entry: FileEtag): void {
  fileEtags.delete(path);
  fileEtags.set(path, entry);
  if (fileEtags.size > FILE_ETAG_MEMORY_MAX) {
    const oldest = fileEtags.keys().next().value;
    if (oldest !== undefined) fileEtags.delete(oldest);
  }
}

export type ImageBody = { path: string } | { bytes: Uint8Array };

export function imageEtag(bytes: Uint8Array): string {
  return `"${createHash("sha256").update(bytes).digest("base64url").slice(0, ETAG_HASH_CHARS)}"`;
}

function opaqueTag(tag: string): string {
  const trimmed = tag.trim();
  return trimmed.startsWith(WEAK_PREFIX) ? trimmed.slice(WEAK_PREFIX.length) : trimmed;
}

// RFC 9110 13.1.2: If-None-Match uses weak comparison and "*" matches any current representation.
export function ifNoneMatchHits(header: string | null, etag: string): boolean {
  if (!header) return false;
  if (header.trim() === "*") return true;
  const target = opaqueTag(etag);
  return header.split(",").some((tag) => opaqueTag(tag) === target);
}

function notModified(headers: Headers): NextResponse {
  headers.delete("Content-Type");
  return new NextResponse(null, { status: 304, headers });
}

async function fileResponse(request: Request, path: string, headers: Headers): Promise<NextResponse> {
  // Stat and read go through one handle so the ETag always matches the bytes even while the cache file is replaced.
  const handle = await open(/*turbopackIgnore: true*/ path, "r");
  try {
    const stats = await handle.stat();
    const known = fileEtags.get(path);
    const unchanged =
      known != null &&
      known.mtimeMs === stats.mtimeMs &&
      known.ctimeMs === stats.ctimeMs &&
      known.size === stats.size &&
      known.ino === stats.ino;
    if (unchanged) {
      headers.set("ETag", known.etag);
      if (ifNoneMatchHits(request.headers.get("if-none-match"), known.etag)) return notModified(headers);
    }
    const bytes = await handle.readFile();
    const etag = unchanged ? known.etag : imageEtag(bytes);
    if (!unchanged) {
      rememberFileEtag(path, {
        mtimeMs: stats.mtimeMs,
        ctimeMs: stats.ctimeMs,
        size: stats.size,
        ino: stats.ino,
        etag,
      });
      headers.set("ETag", etag);
      if (ifNoneMatchHits(request.headers.get("if-none-match"), etag)) return notModified(headers);
    }
    return new NextResponse(new Uint8Array(bytes), { headers });
  } finally {
    await handle.close();
  }
}

export async function imageResponse(
  request: Request,
  body: ImageBody,
  headersInit: HeadersInit,
): Promise<NextResponse> {
  const headers = new Headers(headersInit);
  if ("path" in body) return fileResponse(request, body.path, headers);
  const etag = imageEtag(body.bytes);
  headers.set("ETag", etag);
  if (ifNoneMatchHits(request.headers.get("if-none-match"), etag)) return notModified(headers);
  return new NextResponse(new Uint8Array(body.bytes), { headers });
}
