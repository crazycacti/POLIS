export type PosterEncodeFormat = "webp" | "jpeg";

function posterFormatEnvRaw(): string | undefined {
  return (
    process.env.POLIS_POSTER_FORMAT ?? process.env.NEXT_PUBLIC_POLIS_POSTER_FORMAT
  )?.trim();
}

export function posterEncodeFormat(): PosterEncodeFormat {
  const raw = posterFormatEnvRaw()?.toLowerCase();
  if (raw === "jpeg" || raw === "jpg") return "jpeg";
  return "webp";
}

export function posterDiskExtension(): string {
  return posterEncodeFormat() === "webp" ? ".webp" : ".jpg";
}

export function posterContentType(): string {
  return posterEncodeFormat() === "webp" ? "image/webp" : "image/jpeg";
}
