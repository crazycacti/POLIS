import { afterEach, describe, expect, it } from "bun:test";

import {
  posterContentType,
  posterDiskExtension,
  posterEncodeFormat,
} from "@/lib/poster-output-format";

const priorServer = process.env.POLIS_POSTER_FORMAT;
const priorPublic = process.env.NEXT_PUBLIC_POLIS_POSTER_FORMAT;

afterEach(() => {
  if (priorServer === undefined) delete process.env.POLIS_POSTER_FORMAT;
  else process.env.POLIS_POSTER_FORMAT = priorServer;
  if (priorPublic === undefined) delete process.env.NEXT_PUBLIC_POLIS_POSTER_FORMAT;
  else process.env.NEXT_PUBLIC_POLIS_POSTER_FORMAT = priorPublic;
});

describe("posterEncodeFormat", () => {
  it("defaults to webp", () => {
    delete process.env.POLIS_POSTER_FORMAT;
    delete process.env.NEXT_PUBLIC_POLIS_POSTER_FORMAT;
    expect(posterEncodeFormat()).toBe("webp");
    expect(posterDiskExtension()).toBe(".webp");
    expect(posterContentType()).toBe("image/webp");
  });

  it("honors jpeg override", () => {
    process.env.POLIS_POSTER_FORMAT = "jpeg";
    expect(posterEncodeFormat()).toBe("jpeg");
    expect(posterDiskExtension()).toBe(".jpg");
    expect(posterContentType()).toBe("image/jpeg");
  });

  it("reads NEXT_PUBLIC_POLIS_POSTER_FORMAT on the client bundle", () => {
    delete process.env.POLIS_POSTER_FORMAT;
    process.env.NEXT_PUBLIC_POLIS_POSTER_FORMAT = "jpeg";
    expect(posterEncodeFormat()).toBe("jpeg");
  });
});
