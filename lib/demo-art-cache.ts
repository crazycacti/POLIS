import { readFile } from "node:fs/promises";
import path from "node:path";

import { getDemoTitle } from "@/lib/demo-catalog";

const ART_DIR = path.join(process.cwd(), "public/demo-art");

const artByDemoId = new Map<string, Buffer>();

export async function loadDemoArtBuffer(demoId: string): Promise<Buffer | null> {
  const cached = artByDemoId.get(demoId);
  if (cached) return cached;

  const demo = getDemoTitle(demoId);
  if (!demo) return null;

  try {
    const art = await readFile(path.join(ART_DIR, demo.artFile));
    artByDemoId.set(demoId, art);
    return art;
  } catch {
    return null;
  }
}

export function clearDemoArtCache(): void {
  artByDemoId.clear();
}
