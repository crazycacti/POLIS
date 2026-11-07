import { AsyncLocalStorage } from "async_hooks";

const storage = new AsyncLocalStorage<{ background: true }>();

export function runAsBackgroundUpstreamWork<T>(fn: () => Promise<T>): Promise<T> {
  return storage.run({ background: true }, fn);
}

export function upstreamCallIsBackground(): boolean {
  return storage.getStore()?.background === true;
}
