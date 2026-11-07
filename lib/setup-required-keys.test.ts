import { describe, expect, test } from "bun:test";

import { hasRequiredSetupKeys } from "@/lib/setup-required-keys";

const none = {
  hasServerTmdb: false,
  hasProfileTmdb: false,
  tmdbInput: "",
  hasServerMdblist: false,
  hasProfileMdblist: false,
  mdblistInput: "",
};

describe("hasRequiredSetupKeys", () => {
  test("is false with no server, profile or browser keys", () => {
    expect(hasRequiredSetupKeys(none)).toBe(false);
  });

  test("counts keys stored on the saved profile when the browser has none", () => {
    expect(
      hasRequiredSetupKeys({ ...none, hasProfileTmdb: true, hasProfileMdblist: true }),
    ).toBe(true);
  });

  test("still needs both services when the profile stores only one", () => {
    expect(hasRequiredSetupKeys({ ...none, hasProfileTmdb: true })).toBe(false);
    expect(
      hasRequiredSetupKeys({ ...none, hasProfileTmdb: true, mdblistInput: "browser-key" }),
    ).toBe(true);
  });
});
