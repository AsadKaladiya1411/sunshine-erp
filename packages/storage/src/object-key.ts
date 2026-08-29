import { StorageKeyInvalidError } from "./storage.errors.js";

declare const storageObjectKeyBrand: unique symbol;
export type StorageObjectKey = string & {
  readonly [storageObjectKeyBrand]: true;
};

const safeSegmentPattern = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const credentialShapedPattern =
  /(?:^|[._-])(?:access[_-]?key|secret[_-]?key|password|authorization|credential|token|x-amz)(?:[._-]|$)|^AKIA[A-Z0-9]{16}$/i;

function assertSafeDecodedKey(value: string): void {
  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    throw new StorageKeyInvalidError();
  }

  if (decoded.includes("\\") || /[\u0000-\u001f\u007f]/.test(decoded)) {
    throw new StorageKeyInvalidError();
  }

  for (const segment of decoded.split("/")) {
    if (
      segment.length === 0 ||
      segment === "." ||
      segment === ".." ||
      !safeSegmentPattern.test(segment) ||
      credentialShapedPattern.test(segment)
    ) {
      throw new StorageKeyInvalidError();
    }
  }
}

export function validateStorageObjectKey(value: string): StorageObjectKey {
  if (
    value.length === 0 ||
    value !== value.trim() ||
    Buffer.byteLength(value, "utf8") > 1_024 ||
    value.startsWith("/") ||
    value.endsWith("/")
  ) {
    throw new StorageKeyInvalidError();
  }

  assertSafeDecodedKey(value);
  return value as StorageObjectKey;
}

export function buildStorageObjectKey(
  segments: readonly string[],
): StorageObjectKey {
  if (segments.length === 0) {
    throw new StorageKeyInvalidError();
  }
  return validateStorageObjectKey(segments.join("/"));
}
