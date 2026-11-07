import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import { NextResponse } from "next/server";

const ETAG_HASH_CHARS = 27;
const WEAK_PREFIX = "W/";

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

export async function imageResponse(
  request: Request,
  body: ImageBody,
  headersInit: HeadersInit,
): Promise<NextResponse> {
  const bytes = "path" in body ? await readFile(/*turbopackIgnore: true*/ body.path) : body.bytes;
  const etag = imageEtag(bytes);
  const headers = new Headers(headersInit);
  headers.set("ETag", etag);
  if (ifNoneMatchHits(request.headers.get("if-none-match"), etag)) {
    headers.delete("Content-Type");
    return new NextResponse(null, { status: 304, headers });
  }
  return new NextResponse(new Uint8Array(bytes), { headers });
}
