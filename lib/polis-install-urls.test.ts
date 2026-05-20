import { describe, expect, it } from "bun:test";

import {
  STREMIO_MANIFEST_PATH,
  configConfigurePath,
  configStremioManifestPath,
  polisConfigureUrl,
  stremioLegacyInstallUrl,
  stremioUserInstallUrl,
} from "@/lib/polis-install-urls";

describe("stremioUserInstallUrl", () => {
  it("ends with /manifest.json per Stremio HTTP transport", () => {
    const url = stremioUserInstallUrl("https://polis.example", "S7GfELZtKorB8QsuUrKP");
    expect(url).toBe("https://polis.example/S7GfELZtKorB8QsuUrKP/manifest.json");
    expect(url.endsWith(STREMIO_MANIFEST_PATH)).toBe(true);
    expect(url).not.toContain("manifest.full.json");
  });

  it("configStremioManifestPath uses manifest.json only", () => {
    expect(configStremioManifestPath("abc")).toBe("/abc/manifest.json");
  });

  it("legacy root install uses manifest.json", () => {
    expect(stremioLegacyInstallUrl("https://polis.example")).toBe(
      "https://polis.example/manifest.json",
    );
  });

  it("configConfigurePath uses per-profile configure route", () => {
    expect(configConfigurePath("abc")).toBe("/abc/configure");
    expect(polisConfigureUrl("https://polis.example", "abc")).toBe(
      "https://polis.example/abc/configure",
    );
  });
});
