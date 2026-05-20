"use client";

import { useEffect, useState } from "react";

export function usePreloadedPosterSrc(src: string | null): {
  displaySrc: string | null;
  isLoading: boolean;
  loadFailed: boolean;
} {
  const [displaySrc, setDisplaySrc] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    if (!src) {
      setDisplaySrc(null);
      setIsLoading(false);
      setLoadFailed(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setLoadFailed(false);

    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      if (cancelled) return;
      setDisplaySrc(src);
      setIsLoading(false);
      setLoadFailed(false);
    };
    img.onerror = () => {
      if (cancelled) return;
      setLoadFailed(true);
      setIsLoading(false);
    };
    img.src = src;

    return () => {
      cancelled = true;
    };
  }, [src]);

  return { displaySrc, isLoading, loadFailed };
}

export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [delayMs, value]);

  return debounced;
}
