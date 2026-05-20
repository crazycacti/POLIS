import { access } from "node:fs/promises";
import path from "node:path";

import { DEMO_TITLES } from "@/lib/demo-catalog";
import { posterDiskExtension } from "@/lib/poster-output-format";

const ART_DIR = path.join(process.cwd(), "public/demo-art");
const BAKED_DIR = path.join(process.cwd(), "public/demo-posters");

export async function demoArtIsPresent(): Promise<boolean> {
  try {
    await access(path.join(ART_DIR, DEMO_TITLES[0].artFile));
    return true;
  } catch {
    return false;
  }
}

export async function bakedDemoPostersArePresent(): Promise<boolean> {
  try {
    for (const demo of DEMO_TITLES) {
      await access(path.join(BAKED_DIR, `${demo.id}${posterDiskExtension()}`));
    }
    return true;
  } catch {
    return false;
  }
}
