import { FileInputError } from "./errors.js";
import { createHash } from "node:crypto";
import { promisify } from "node:util";
import { brotliCompress, brotliDecompress, constants } from "node:zlib";

const compress = promisify(brotliCompress);
const decompress = promisify(brotliDecompress);
export const MAX_FILE_BYTES = 5 * 1024 * 1024;

export async function compressFile(original: Buffer) {
  if (!original.length || original.length > MAX_FILE_BYTES)
    throw new FileInputError("Files must contain between 1 byte and 5 MB.");
  const compressed = await compress(original, {
    params: {
      [constants.BROTLI_PARAM_QUALITY]: 5,
      [constants.BROTLI_PARAM_SIZE_HINT]: original.length,
    },
  });
  return {
    compressed,
    originalSize: original.length,
    compressedSize: compressed.length,
    sha256: createHash("sha256").update(original).digest("hex"),
  };
}

export async function restoreFile(
  compressed: Buffer,
  originalSize: number,
  sha256: string,
) {
  if (originalSize < 1 || originalSize > MAX_FILE_BYTES)
    throw new Error("Stored file exceeds the allowed size.");
  const original = await decompress(compressed, {
    maxOutputLength: originalSize,
  });
  if (
    original.length !== originalSize ||
    createHash("sha256").update(original).digest("hex") !== sha256
  )
    throw new Error("Stored file integrity check failed.");
  return original;
}
