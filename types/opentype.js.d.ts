declare module "opentype.js" {
  export type BoundingBox = {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  };

  export type Glyph = {
    index: number;
    advanceWidth?: number;
    getPath(x: number, y: number, fontSize: number): {
      getBoundingBox(): BoundingBox;
      toPathData(decimalPlaces?: number): string;
    };
  };

  export type Font = {
    unitsPerEm: number;
    ascender: number;
    descender: number;
    tables: { os2?: { sCapHeight?: number } };
    charToGlyph(char: string): Glyph;
  };

  export function parse(buffer: ArrayBuffer | Buffer): Font;
}
