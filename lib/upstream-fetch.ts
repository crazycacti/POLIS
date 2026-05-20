import { upstreamHeadersFromClientContext } from "@/lib/client-request-context";

const DEFAULT_TIMEOUT_MS = 8_000;

export type UpstreamFetchInit = RequestInit & {
  timeoutMs?: number;
  revalidateSeconds?: number;
};

export async function fetchUpstream(
  input: RequestInfo | URL,
  init: UpstreamFetchInit = {},
): Promise<Response> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, revalidateSeconds, headers, ...rest } = init;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const next =
    revalidateSeconds != null
      ? { revalidate: revalidateSeconds }
      : undefined;

  try {
    return await fetch(input, {
      ...rest,
      headers: upstreamHeadersFromClientContext(headers),
      signal: rest.signal ?? controller.signal,
      next: next ?? rest.next,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}
