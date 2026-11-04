import { polisSingleflight } from "@/lib/polis-singleflight";

const REFRESH_RETRY_DELAY_MS = 5 * 60 * 1000;
const refreshBlockedUntil = new Map<string, number>();

function refreshAllowed(key: string): boolean {
  const until = refreshBlockedUntil.get(key);
  if (until == null) return true;
  if (Date.now() < until) return false;
  refreshBlockedUntil.delete(key);
  return true;
}

function blockRefresh(key: string): void {
  refreshBlockedUntil.set(key, Date.now() + REFRESH_RETRY_DELAY_MS);
}

export async function serveFreshOrStale<T>(params: {
  key: string;
  label: string;
  readFresh: () => Promise<T | null>;
  readStale: () => Promise<T | null>;
  build: () => Promise<T>;
  store: (value: T) => Promise<void>;
  isStorable: (value: T) => boolean;
}): Promise<T> {
  const fresh = await params.readFresh();
  if (fresh) return fresh;

  const rebuild = () =>
    polisSingleflight(params.key, async () => {
      const raced = await params.readFresh();
      if (raced) return raced;
      const value = await params.build();
      if (params.isStorable(value)) {
        void params.store(value).catch((error) => {
          console.warn(`[polis] ${params.label} cache write failed`, error);
        });
      }
      return value;
    });

  const stale = await params.readStale();
  if (!stale) return rebuild();

  if (refreshAllowed(params.key)) {
    void rebuild().then(
      (value) => {
        if (!params.isStorable(value)) blockRefresh(params.key);
      },
      (error) => {
        blockRefresh(params.key);
        console.warn(`[polis] background ${params.label} refresh failed`, error);
      },
    );
  }
  return stale;
}
