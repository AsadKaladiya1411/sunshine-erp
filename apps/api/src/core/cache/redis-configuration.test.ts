import { describe, expect, it } from "@jest/globals";
import { parseEnvironment } from "@sunshine-erp/config";

const baseEnvironment = {
  DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/sunshine_erp",
};

describe("Redis configuration", () => {
  it("accepts redis and rediss URLs with centralized defaults", () => {
    expect(
      parseEnvironment({
        ...baseEnvironment,
        REDIS_URL: "redis://localhost:6379",
      }),
    ).toMatchObject({
      REDIS_URL: "redis://localhost:6379",
      REDIS_CONNECT_TIMEOUT_MS: 5_000,
      REDIS_KEY_PREFIX: "sunshine",
    });
    expect(
      parseEnvironment({
        ...baseEnvironment,
        REDIS_URL: "rediss://cache.example.invalid:6380",
      }).REDIS_URL,
    ).toBe("rediss://cache.example.invalid:6380");
  });

  it("rejects invalid Redis protocols and key prefixes", () => {
    expect(() =>
      parseEnvironment({
        ...baseEnvironment,
        REDIS_URL: "https://localhost:6379",
      }),
    ).toThrow();
    expect(() =>
      parseEnvironment({
        ...baseEnvironment,
        REDIS_KEY_PREFIX: "unsafe prefix",
      }),
    ).toThrow();
  });

  it("allows Redis to be omitted so PostgreSQL-backed API traffic can continue", () => {
    expect(parseEnvironment(baseEnvironment).REDIS_URL).toBeUndefined();
  });
});
