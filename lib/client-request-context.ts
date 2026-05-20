import { AsyncLocalStorage } from "async_hooks";

export type ClientRequestContext = {
  ip: string;
  userAgent: string | null;
  acceptLanguage: string | null;
};

const storage = new AsyncLocalStorage<ClientRequestContext>();

function firstForwardedIp(forwarded: string): string | null {
  const first = forwarded.split(",")[0]?.trim();
  return first || null;
}

export function clientIpFromRequest(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const ip = firstForwardedIp(forwarded);
    if (ip) return ip;
  }

  for (const header of ["cf-connecting-ip", "true-client-ip", "x-real-ip"]) {
    const value = request.headers.get(header)?.trim();
    if (value) return value;
  }

  return null;
}

export function clientRequestContextFromRequest(request: Request): ClientRequestContext | null {
  const ip = clientIpFromRequest(request);
  if (!ip) return null;

  return {
    ip,
    userAgent: request.headers.get("user-agent")?.trim() || null,
    acceptLanguage: request.headers.get("accept-language")?.trim() || null,
  };
}

export function getClientRequestContext(): ClientRequestContext | undefined {
  return storage.getStore();
}

export function runWithClientRequestContext<T>(
  request: Request,
  fn: () => T | Promise<T>,
): T | Promise<T> {
  const ctx = clientRequestContextFromRequest(request);
  if (!ctx) return fn();
  return storage.run(ctx, fn);
}

export function upstreamHeadersFromClientContext(
  init?: HeadersInit,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (init) {
    const headers = new Headers(init);
    headers.forEach((value, key) => {
      out[key] = value;
    });
  }

  const ctx = getClientRequestContext();
  if (!ctx) return out;

  if (!Object.keys(out).some((k) => k.toLowerCase() === "x-forwarded-for")) {
    out["X-Forwarded-For"] = ctx.ip;
  }
  if (ctx.userAgent && !Object.keys(out).some((k) => k.toLowerCase() === "user-agent")) {
    out["User-Agent"] = ctx.userAgent;
  }
  if (
    ctx.acceptLanguage &&
    !Object.keys(out).some((k) => k.toLowerCase() === "accept-language")
  ) {
    out["Accept-Language"] = ctx.acceptLanguage;
  }

  return out;
}
