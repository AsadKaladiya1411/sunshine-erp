import { Readable } from "node:stream";
import { describe, expect, it, jest } from "@jest/globals";
import { ObjectStorageInfrastructureClient } from "./storage-client.js";
import {
  StorageDeleteError,
  StorageDisabledError,
  StorageDownloadError,
  StorageHeadError,
  StorageUnavailableError,
  StorageUploadError,
} from "./storage.errors.js";
import type {
  StorageOperationalLogger,
  StorageTransport,
} from "./storage.types.js";

const enabledConfiguration = {
  enabled: true,
  endpoint: "http://localhost:9000",
  accessKey: "foundation-access",
  secretKey: "foundation-secret",
  bucket: "sunshine-erp",
  region: "us-east-1",
} as const;

function createTransport(
  overrides: Partial<StorageTransport> = {},
): StorageTransport {
  return {
    bucketExists: jest.fn(async () => true),
    makeBucket: jest.fn(async () => undefined),
    putObject: jest.fn(async () => undefined),
    getObject: jest.fn(async () => Readable.from([Buffer.from("payload")])),
    statObject: jest.fn(async () => ({
      size: 7,
      etag: "etag",
      contentType: "application/octet-stream",
    })),
    removeObject: jest.fn(async () => undefined),
    close: jest.fn(async () => undefined),
    ...overrides,
  };
}

function recordingLogger(): {
  readonly logger: StorageOperationalLogger;
  readonly records: unknown[];
} {
  const records: unknown[] = [];
  return {
    records,
    logger: {
      info(bindings, message) {
        records.push({ bindings, message });
      },
      warn(bindings, message) {
        records.push({ bindings, message });
      },
    },
  };
}

async function readAll(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

describe("object storage infrastructure client", () => {
  it("initializes the bucket, checks availability, and cleans up exactly once", async () => {
    const transport = createTransport({
      bucketExists: jest.fn(async () => false),
    });
    const client = new ObjectStorageInfrastructureClient(
      enabledConfiguration,
      () => transport,
    );

    await expect(client.connect()).resolves.toBe(true);
    await expect(client.connect()).resolves.toBe(true);
    expect(transport.makeBucket).toHaveBeenCalledTimes(1);
    await expect(client.ping()).resolves.toBe(false);
    await client.disconnect();
    await client.disconnect();
    expect(transport.close).toHaveBeenCalledTimes(1);
  });

  it("keeps disabled storage optional and rejects object operations", async () => {
    const client = new ObjectStorageInfrastructureClient({
      enabled: false,
      region: "us-east-1",
    });

    await expect(client.connect()).resolves.toBe(false);
    await expect(client.ping()).resolves.toBe(false);
    await expect(
      client.getObject("objects/content.bin"),
    ).rejects.toBeInstanceOf(StorageDisabledError);
    await client.disconnect();
  });

  it("uploads, streams downloads, reads metadata, checks existence, and deletes", async () => {
    const transport = createTransport();
    const client = new ObjectStorageInfrastructureClient(
      enabledConfiguration,
      () => transport,
    );
    await client.connect();

    await client.putObject({
      key: "objects/content.bin",
      body: Readable.from([Buffer.from("payload")]),
      size: 7,
      contentType: "application/octet-stream",
    });
    await expect(
      readAll(await client.getObject("objects/content.bin")),
    ).resolves.toEqual(Buffer.from("payload"));
    await expect(
      client.headObject("objects/content.bin"),
    ).resolves.toMatchObject({
      size: 7,
      etag: "etag",
    });
    await expect(client.objectExists("objects/content.bin")).resolves.toBe(
      true,
    );
    await client.deleteObject("objects/content.bin");

    expect(transport.putObject).toHaveBeenCalledTimes(1);
    expect(transport.getObject).toHaveBeenCalledTimes(1);
    expect(transport.removeObject).toHaveBeenCalledTimes(1);
  });

  it("returns false only for a storage-native missing-object result", async () => {
    const transport = createTransport({
      statObject: jest.fn(async () => {
        throw Object.assign(new Error("not found"), { code: "NoSuchKey" });
      }),
    });
    const client = new ObjectStorageInfrastructureClient(
      enabledConfiguration,
      () => transport,
    );
    await client.connect();

    await expect(client.objectExists("objects/missing.bin")).resolves.toBe(
      false,
    );
  });

  const failureCases: ReadonlyArray<
    [
      string,
      "putObject" | "getObject" | "statObject" | "removeObject",
      new () => Error,
    ]
  > = [
    ["upload", "putObject", StorageUploadError],
    ["download", "getObject", StorageDownloadError],
    ["head", "statObject", StorageHeadError],
    ["delete", "removeObject", StorageDeleteError],
  ];

  it.each(failureCases)(
    "maps raw %s failures to safe typed errors",
    async (_name, method, ErrorType) => {
      const transport = createTransport({
        [method]: jest.fn(async () => {
          throw new Error("raw SDK failure with internal endpoint");
        }),
      });
      const client = new ObjectStorageInfrastructureClient(
        enabledConfiguration,
        () => transport,
      );
      await client.connect();

      const operation =
        method === "putObject"
          ? client.putObject({
              key: "objects/content.bin",
              body: Buffer.from("x"),
            })
          : method === "getObject"
            ? client.getObject("objects/content.bin")
            : method === "statObject"
              ? client.headObject("objects/content.bin")
              : client.deleteObject("objects/content.bin");
      await expect(operation).rejects.toBeInstanceOf(ErrorType);
    },
  );

  it("fails open when unavailable without logging credentials or raw messages", async () => {
    const secret = "foundation-secret-that-must-not-be-logged";
    const recording = recordingLogger();
    const transport = createTransport({
      bucketExists: jest.fn(async () => {
        throw Object.assign(new Error(`failed using ${secret}`), {
          code: "ECONNREFUSED",
        });
      }),
    });
    const client = new ObjectStorageInfrastructureClient(
      { ...enabledConfiguration, secretKey: secret },
      () => transport,
      recording.logger,
    );

    await expect(client.connect()).resolves.toBe(false);
    await expect(
      client.getObject("objects/content.bin"),
    ).rejects.toBeInstanceOf(StorageUnavailableError);
    expect(JSON.stringify(recording.records)).not.toContain(secret);
    expect(JSON.stringify(recording.records)).not.toContain("failed using");
    expect(recording.records).toContainEqual(
      expect.objectContaining({
        bindings: {
          component: "object-storage",
          errorCode: "STORAGE_CONNECTION_FAILED",
        },
      }),
    );
  });
});
