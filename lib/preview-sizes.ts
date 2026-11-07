export const PREVIEW_THUMB_WIDTHS = [160, 320] as const;
export const PREVIEW_WIDTH_PARAM = "w";

export type PreviewThumbWidth = (typeof PREVIEW_THUMB_WIDTHS)[number];

export const PREVIEW_SMALL_THUMB_WIDTH: PreviewThumbWidth = PREVIEW_THUMB_WIDTHS[0];

export function previewThumbSrcSet(pathForWidth: (width: PreviewThumbWidth) => string): string {
  return PREVIEW_THUMB_WIDTHS.map((width) => `${pathForWidth(width)} ${width}w`).join(", ");
}
