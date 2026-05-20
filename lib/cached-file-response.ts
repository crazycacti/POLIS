import { createReadStream } from "node:fs";
import { Readable } from "node:stream";

export function cachedFileReadableStream(filePath: string): ReadableStream<Uint8Array> {
  return Readable.toWeb(createReadStream(filePath)) as ReadableStream<Uint8Array>;
}
