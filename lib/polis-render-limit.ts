import { availableParallelism } from "node:os";

import { polisEnvPositiveInt } from "@/lib/polis-env-int";

let active = 0;
const waiters: (() => void)[] = [];

function release(): void {
  active = Math.max(0, active - 1);
  const next = waiters.shift();
  if (next) next();
}

function acquire(max: number): Promise<void> {
  if (active < max) {
    active += 1;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    waiters.push(() => {
      active += 1;
      resolve();
    });
  });
}

export function polisRenderMaxConcurrent(): number {
  return polisEnvPositiveInt("POLIS_RENDER_MAX_CONCURRENT") ?? Math.max(1, availableParallelism());
}

export type CpuStage = <T>(fn: () => Promise<T>) => Promise<T>;

export const runWithoutRenderLimit: CpuStage = (fn) => fn();

export async function withPolisRenderLimit<T>(fn: () => Promise<T>): Promise<T> {
  await acquire(polisRenderMaxConcurrent());
  try {
    return await fn();
  } finally {
    release();
  }
}

export function polisRenderLimitActiveCount(): number {
  return active;
}
