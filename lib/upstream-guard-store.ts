import { readFileSync } from "node:fs";
import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { polisCacheRoot } from "@/lib/polis-cache-path";

const GUARD_STATE_FILE = "upstream-guard.json";
const SAVE_DELAY_MS = 15_000;

export type GuardStateStore = {
  load: () => unknown;
  scheduleSave: () => void;
};

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

export function guardStateStore(snapshot: () => unknown, file = path.join(polisCacheRoot(), GUARD_STATE_FILE)): GuardStateStore {
  let timer: ReturnType<typeof setTimeout> | null = null;

  async function save(): Promise<void> {
    const temp = `${file}.${process.pid}.tmp`;
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(temp, JSON.stringify(snapshot()));
    await rename(temp, file);
  }

  return {
    load() {
      try {
        return JSON.parse(readFileSync(file, "utf8")) as unknown;
      } catch (error) {
        if (!isMissingFile(error)) console.warn("[polis] could not read saved upstream usage, starting fresh", error);
        return null;
      }
    },
    scheduleSave() {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        save().catch((error: unknown) => console.warn("[polis] could not save upstream usage", error));
      }, SAVE_DELAY_MS);
      timer.unref?.();
    },
  };
}

export function guardStatePersistenceEnabled(): boolean {
  return process.env.NODE_ENV !== "test" && process.env.POLIS_CACHE_DISABLE !== "1";
}
