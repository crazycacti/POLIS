const UNKNOWN_PROXY_CLIENT = "unknown";

// The proxy in front of POLIS appends the caller's address last; earlier entries come from the caller.
export function proxyClientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const last = forwarded?.split(",").map((part) => part.trim()).filter(Boolean).at(-1);
  return last || request.headers.get("x-real-ip")?.trim() || UNKNOWN_PROXY_CLIENT;
}
