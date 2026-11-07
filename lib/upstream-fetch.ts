import { POLIS_ADDON_VERSION } from "@/lib/polis-renderer";
import { POLIS_GITHUB_URL } from "@/lib/site-links";
import { redactUpstreamSecrets } from "@/lib/upstream-guard";

const DEFAULT_TIMEOUT_MS = 8_000;
export const IMAGE_FETCH_TIMEOUT_MS = 20_000;

export const POLIS_USER_AGENT = `POLIS/${POLIS_ADDON_VERSION} (+${POLIS_GITHUB_URL})`;

export type UpstreamFetchInit = RequestInit & {
  timeoutMs?: number;
  revalidateSeconds?: number;
};

function upstreamHeaders(init?: HeadersInit): Headers {
  const headers = new Headers(init);
  if (!headers.has("user-agent")) headers.set("User-Agent", POLIS_USER_AGENT);
  return headers;
}

export async function fetchUpstream(
  input: RequestInfo | URL,
  init: UpstreamFetchInit = {},
): Promise<Response> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, revalidateSeconds, headers, ...rest } = init;

  const next =
    revalidateSeconds != null
      ? { revalidate: revalidateSeconds }
      : undefined;

  try {
    return await fetch(input, {
      ...rest,
      headers: upstreamHeaders(headers),
      signal: rest.signal ?? AbortSignal.timeout(timeoutMs),
      next: next ?? rest.next,
    });
  } catch (error) {
    throw redactedFetchError(error);
  }
}

// Fetch errors carry the request URL (with api keys) in fields such as `path`; rethrow without them.
function redactedFetchError(error: unknown): Error {
  const source = error instanceof Error ? error : null;
  const redacted = new Error(redactUpstreamSecrets(source?.message ?? String(error)));
  redacted.name = source?.name ?? "Error";
  return redacted;
}
