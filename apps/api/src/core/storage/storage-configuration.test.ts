import { describe, expect, it } from "@jest/globals";
import { parseEnvironment } from "@sunshine-erp/config";

const baseEnvironment = {
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/sunshine_erp",
};

const productionEnvironment = {
  ...baseEnvironment,
  NODE_ENV: "production",
  JWT_SECRET: "production-jwt-secret-at-least-32-characters",
  REFRESH_TOKEN_DIGEST_SECRET:
    "production-refresh-digest-secret-at-least-32-characters",
  REFRESH_COOKIE_SECURE: "true",
};

const enabledStorageEnvironment = {
  STORAGE_ENABLED: "true",
  STORAGE_ENDPOINT: "http://localhost:9000",
  STORAGE_ACCESS_KEY: "sunshine-minio",
  STORAGE_SECRET_KEY: "development-only-minio-secret",
  STORAGE_BUCKET: "sunshine-erp",
  STORAGE_REGION: "us-east-1",
};

describe("object storage configuration", () => {
  it("accepts a valid enabled local MinIO configuration", () => {
    expect(
      parseEnvironment({
        ...baseEnvironment,
        ...enabledStorageEnvironment,
      }),
    ).toMatchObject({
      STORAGE_ENABLED: true,
      STORAGE_ENDPOINT: "http://localhost:9000",
      STORAGE_BUCKET: "sunshine-erp",
      STORAGE_REGION: "us-east-1",
    });
  });

  it("rejects plaintext storage when enabled in production", () => {
    expect(() =>
      parseEnvironment({
        ...productionEnvironment,
        ...enabledStorageEnvironment,
      }),
    ).toThrow(
      "STORAGE_ENDPOINT must use HTTPS when object storage is enabled in production.",
    );
  });

  it("accepts HTTPS storage when enabled in production", () => {
    expect(
      parseEnvironment({
        ...productionEnvironment,
        ...enabledStorageEnvironment,
        STORAGE_ENDPOINT: "https://storage.example.com",
      }),
    ).toMatchObject({
      STORAGE_ENABLED: true,
      STORAGE_ENDPOINT: "https://storage.example.com",
    });
  });

  it("preserves HTTP storage for local development and test environments", () => {
    for (const NODE_ENV of ["development", "test"] as const) {
      expect(
        parseEnvironment({
          ...baseEnvironment,
          ...enabledStorageEnvironment,
          NODE_ENV,
        }),
      ).toMatchObject({
        NODE_ENV,
        STORAGE_ENABLED: true,
        STORAGE_ENDPOINT: "http://localhost:9000",
      });
    }
  });

  it("allows storage to remain disabled without endpoint or credentials", () => {
    const configuration = parseEnvironment({
      ...baseEnvironment,
      STORAGE_ENABLED: "false",
    });

    expect(configuration.STORAGE_ENABLED).toBe(false);
    expect(configuration.STORAGE_ENDPOINT).toBeUndefined();
    expect(configuration.STORAGE_ACCESS_KEY).toBeUndefined();
    expect(configuration.STORAGE_SECRET_KEY).toBeUndefined();
  });

  it("rejects enabled storage when required values are absent", () => {
    expect(() =>
      parseEnvironment({ ...baseEnvironment, STORAGE_ENABLED: "true" }),
    ).toThrow();
  });

  it.each([
    { STORAGE_ENDPOINT: "ftp://localhost:9000" },
    { STORAGE_ENDPOINT: "http://user:secret@localhost:9000" },
    { STORAGE_ENDPOINT: "http://localhost:9000/private" },
    { STORAGE_BUCKET: "Invalid_Bucket" },
    { STORAGE_BUCKET: "192.168.1.1" },
    { STORAGE_REGION: "invalid region" },
  ])("rejects malformed storage configuration %#", (invalidValue) => {
    expect(() =>
      parseEnvironment({
        ...baseEnvironment,
        STORAGE_ENABLED: "false",
        STORAGE_ENDPOINT: "http://localhost:9000",
        STORAGE_ACCESS_KEY: "sunshine-minio",
        STORAGE_SECRET_KEY: "development-only-minio-secret",
        STORAGE_BUCKET: "sunshine-erp",
        STORAGE_REGION: "us-east-1",
        ...invalidValue,
      }),
    ).toThrow();
  });
});
