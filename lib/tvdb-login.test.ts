import { describe, expect, it } from "bun:test";

import { validateTvdbKey } from "@/lib/api-key-validate";
import { tvdbLogin, tvdbLoginResult } from "@/lib/tvdb-client";
import { parseTvdbCredentials } from "@/lib/tvdb-credentials";

const liveTvdbKey = process.env.POLIS_LIVE_TESTS === "1" ? process.env.TVDB_API_KEY?.trim() : undefined;

describe.skipIf(!liveTvdbKey)("tvdbLogin against live TVDB", () => {
  it("parses and logs in", async () => {
    const raw = liveTvdbKey ?? "";

    const credentials = parseTvdbCredentials(raw);
    expect(credentials).not.toBeNull();
    expect(credentials!.apiKey.length).toBeGreaterThanOrEqual(8);

    const result = await tvdbLoginResult({ apiKey: credentials!.apiKey });
    expect(result.ok).toBe(true);
    expect((await tvdbLogin({ apiKey: credentials!.apiKey }))?.length).toBeGreaterThan(0);
  });

  it("validateTvdbKey matches login for env credentials", async () => {
    const raw = liveTvdbKey ?? "";

    const validated = await validateTvdbKey(raw);
    const credentials = parseTvdbCredentials(raw);
    expect(credentials).not.toBeNull();

    const login = await tvdbLoginResult({ apiKey: credentials!.apiKey });
    expect(validated.ok).toBe(login.ok);
  });
});
