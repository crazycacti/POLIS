import { upstreamHeadersFromClientContext } from "@/lib/client-request-context";

const DEFAULT_TIMEOUT_MS = 8_000;
export const IMAGE_FETCH_TIMEOUT_MS = 20_000;

export type UpstreamFetchInit = RequestInit & {
  timeoutMs?: number;
  revalidateSeconds?: number;
};

export async function fetchUpstream(
  input: RequestInfo | URL,
  init: UpstreamFetchInit = {},
): Promise<Response> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, revalidateSeconds, headers, ...rest } = init;

  const next =
    revalidateSeconds != null
      ? { revalidate: revalidateSeconds }
      : undefined;

  return fetch(input, {
    ...rest,
    headers: upstreamHeadersFromClientContext(headers),
    signal: rest.signal ?? AbortSignal.timeout(timeoutMs),
    next: next ?? rest.next,
  });
}
