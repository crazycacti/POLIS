export type PosterPart = "artwork" | "logo" | "trend" | "badges" | "rating" | "genre" | "shade";

export function posterPartHeaderId(part: PosterPart): string {
  return `poster-part-${part}`;
}

export function posterPartBodyId(part: PosterPart): string {
  return `poster-part-${part}-controls`;
}
