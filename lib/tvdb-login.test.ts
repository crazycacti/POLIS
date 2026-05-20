import { describe, expect, it } from "bun:test";

import { validateTvdbKey } from "@/lib/api-key-validate";
import { tvdbLogin, tvdbLoginResult } from "@/lib/tvdb-client";
import { parseTvdbCredentials } from "@/lib/tvdb-credentials";

describe("tvdbLogin integration", () => {
  it("parses and logs in when TVDB_API_KEY is set", async () => {
    const raw = process.env.TVDB_API_KEY?.trim();
    if (!raw) return;

    const credentials = parseTvdbCredentials(raw);
    expect(credentials).not.toBeNull();
    expect(credentials!.apiKey.length).toBeGreaterThanOrEqual(8);

    const result = await tvdbLoginResult({ apiKey: credentials!.apiKey });
    expect(result.ok).toBe(true);
    expect((await tvdbLogin({ apiKey: credentials!.apiKey }))?.length).toBeGreaterThan(0);
  });

  it("validateTvdbKey matches login for env credentials", async () => {
    const raw = process.env.TVDB_API_KEY?.trim();
    if (!raw) return;

    const validated = await validateTvdbKey(raw);
    const credentials = parseTvdbCredentials(raw);
    expect(credentials).not.toBeNull();

    const login = await tvdbLoginResult({ apiKey: credentials!.apiKey });
    expect(validated.ok).toBe(login.ok);
  });
});
