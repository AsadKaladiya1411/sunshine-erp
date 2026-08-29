import { describe, expect, it } from "@jest/globals";
import {
  buildStorageObjectKey,
  validateStorageObjectKey,
} from "./object-key.js";
import { StorageKeyInvalidError } from "./storage.errors.js";

describe("storage object keys", () => {
  it("builds deterministic generic organization/document/version keys", () => {
    expect(
      buildStorageObjectKey([
        "organizations",
        "9c54b866-e884-46ea-b051-8af18c44a9a0",
        "documents",
        "81e023ed-061b-42eb-9374-3dda8d231125",
        "versions",
        "0001",
        "content.bin",
      ]),
    ).toBe(
      "organizations/9c54b866-e884-46ea-b051-8af18c44a9a0/documents/81e023ed-061b-42eb-9374-3dda8d231125/versions/0001/content.bin",
    );
  });

  it.each([
    "../file.bin",
    "organizations/../file.bin",
    "organizations/%2e%2e/file.bin",
    "organizations\\file.bin",
    "/organizations/file.bin",
    "organizations//file.bin",
    "organizations/access-key/file.bin",
    "organizations/AKIAABCDEFGHIJKLMNOP/file.bin",
  ])("rejects unsafe or credential-shaped key %s", (key) => {
    expect(() => validateStorageObjectKey(key)).toThrow(StorageKeyInvalidError);
  });
});
