"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const RETRY_PARAM = "retry=1";
const MAX_RETRY_WAIT_MS = 15_000;
const LIMITED_FALLBACK_MS = 60_000;
const TOO_MANY_REQUESTS = 429;
const MS_PER_SEC = 1000;

type FallbackEntry = { retried: boolean; fallback: boolean };

export function withPreviewRetry(url: string): string {
  return `${url}${url.includes("?") ? "&" : "?"}${RETRY_PARAM}`;
}

export function withPreviewRetrySrcSet(srcSet: string): string {
  return srcSet
    .split(", ")
    .map((candidate) => {
      const space = candidate.lastIndexOf(" ");
      if (space < 0) return withPreviewRetry(candidate);
      return `${withPreviewRetry(candidate.slice(0, space))}${candidate.slice(space)}`;
    })
    .join(", ");
}

function retryAfterMs(response: Response): number {
  const seconds = Number(response.headers.get("retry-after"));
  const wait = Number.isFinite(seconds) && seconds > 0 ? seconds * MS_PER_SEC : MS_PER_SEC;
  return Math.min(wait, MAX_RETRY_WAIT_MS);
}

export function usePreviewFallbacks(): {
  stateFor: (key: string) => FallbackEntry | undefined;
  reportError: (key: string, failedUrl: string) => void;
} {
  const [entries, setEntries] = useState<ReadonlyMap<string, FallbackEntry>>(() => new Map());
  const entriesRef = useRef(entries);
  const probing = useRef(new Set<string>());
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());

  useEffect(() => {
    entriesRef.current = entries;
  }, [entries]);

  useEffect(() => {
    const active = timers.current;
    return () => {
      for (const timer of active) clearTimeout(timer);
      active.clear();
    };
  }, []);

  const setEntry = useCallback((key: string, entry: FallbackEntry | null) => {
    setEntries((prev) => {
      const next = new Map(prev);
      if (entry) next.set(key, entry);
      else next.delete(key);
      return next;
    });
  }, []);

  const later = useCallback((ms: number, fn: () => void) => {
    const timer = setTimeout(() => {
      timers.current.delete(timer);
      fn();
    }, ms);
    timers.current.add(timer);
  }, []);

  const reportError = useCallback(
    (key: string, failedUrl: string) => {
      const current = entriesRef.current.get(key);
      if (current?.fallback || probing.current.has(key)) return;
      probing.current.add(key);
      void fetch(failedUrl, { cache: "no-store" })
        .then((response) => {
          void response.body?.cancel();
          if (response.ok) {
            setEntry(key, { retried: true, fallback: false });
          } else if (response.status === TOO_MANY_REQUESTS && !current?.retried) {
            later(retryAfterMs(response), () => setEntry(key, { retried: true, fallback: false }));
          } else if (response.status === TOO_MANY_REQUESTS) {
            setEntry(key, { retried: true, fallback: true });
            later(LIMITED_FALLBACK_MS, () => setEntry(key, null));
          } else {
            setEntry(key, { retried: true, fallback: true });
          }
        })
        .catch(() => setEntry(key, { retried: true, fallback: true }))
        .finally(() => probing.current.delete(key));
    },
    [later, setEntry],
  );

  const stateFor = useCallback((key: string) => entries.get(key), [entries]);
  return { stateFor, reportError };
}
