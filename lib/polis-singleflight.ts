const inFlight = new Map<string, Promise<unknown>>();

export function polisSingleflight<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = inFlight.get(key);
  if (existing) return existing as Promise<T>;

  const promise = fn().finally(() => {
    if (inFlight.get(key) === promise) inFlight.delete(key);
  });
  inFlight.set(key, promise);
  return promise;
}

export function polisSingleflightInFlightCount(): number {
  return inFlight.size;
}
