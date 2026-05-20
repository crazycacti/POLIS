import type { MdblistListSummary } from "@/lib/mdblist-list-catalog";
import { fetchUpstream } from "@/lib/upstream-fetch";

export type { MdblistListSummary } from "@/lib/mdblist-list-catalog";
export { mdblistListToCatalogDefinitions } from "@/lib/mdblist-list-catalog";

function listIdFromRow(row: Record<string, unknown>): string | null {
  const id = row.id ?? row.list_id ?? row.listid;
  if (typeof id === "number" && id > 0) return String(id);
  if (typeof id === "string" && /^\d+$/.test(id.trim())) return id.trim();
  return null;
}

function listNameFromRow(row: Record<string, unknown>): string {
  const name = row.name ?? row.title ?? row.list_name;
  return typeof name === "string" && name.trim() ? name.trim() : "Untitled list";
}

function mediatypeFromRow(row: Record<string, unknown>): string | null {
  const raw = row.mediatype ?? row.media_type ?? row.media ?? row.type;
  if (typeof raw !== "string" || !raw.trim()) return null;
  const v = raw.trim().toLowerCase();
  if (v === "movie" || v === "movies" || v === "film") return "movie";
  if (v === "show" || v === "shows" || v === "series" || v === "tv") return "series";
  return v;
}

function usernameFromRow(row: Record<string, unknown>): string | null {
  const raw = row.username ?? row.user ?? row.owner;
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

function rowsFromPayload(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) {
    return payload.filter((r): r is Record<string, unknown> => Boolean(r) && typeof r === "object");
  }
  if (!payload || typeof payload !== "object") return [];
  const record = payload as Record<string, unknown>;
  for (const key of ["lists", "results", "data", "items"]) {
    const raw = record[key];
    if (Array.isArray(raw)) {
      return raw.filter((r): r is Record<string, unknown> => Boolean(r) && typeof r === "object");
    }
  }
  return [];
}

function summariesFromRows(rows: Record<string, unknown>[]): MdblistListSummary[] {
  const out: MdblistListSummary[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const id = listIdFromRow(row);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      name: listNameFromRow(row),
      mediatype: mediatypeFromRow(row),
      username: usernameFromRow(row),
    });
  }
  return out;
}

async function mdblistListsGet(url: URL, apiKey: string): Promise<MdblistListSummary[]> {
  url.searchParams.set("apikey", apiKey);
  const res = await fetchUpstream(url, {
    headers: { Accept: "application/json" },
    revalidateSeconds: 0,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `MDBList HTTP ${res.status}`);
  }
  const payload = (await res.json()) as unknown;
  return summariesFromRows(rowsFromPayload(payload));
}

export async function fetchMdblistUserListsByUsername(
  username: string,
  apiKey: string,
): Promise<MdblistListSummary[]> {
  const user = username.trim();
  if (!user) return [];
  const url = new URL(`https://api.mdblist.com/lists/user/${encodeURIComponent(user)}`);
  return mdblistListsGet(url, apiKey);
}

export async function fetchMdblistOwnLists(apiKey: string): Promise<MdblistListSummary[]> {
  const url = new URL("https://api.mdblist.com/lists/user");
  return mdblistListsGet(url, apiKey);
}

export async function searchMdblistLists(
  query: string,
  apiKey: string,
): Promise<MdblistListSummary[]> {
  const q = query.trim();
  if (!q) return [];
  const url = new URL("https://api.mdblist.com/lists/search");
  url.searchParams.set("query", q);
  return mdblistListsGet(url, apiKey);
}
