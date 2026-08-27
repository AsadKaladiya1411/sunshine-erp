import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, jest } from "@jest/globals";
import { CacheService } from "./cache.service.js";
import { RedisDistributedLock } from "./distributed-lock.service.js";
import { RedisRateLimitCounterStore } from "./rate-limit-counter.store.js";
import {
  NodeRedisInfrastructureClient,
  type RedisInfrastructureClient,
} from "./redis-client.js";
import { RedisUnavailableError } from "./redis.errors.js";
import { RedisKeyBuilder } from "./redis-key-builder.js";

const redisUrl = process.env.REDIS_URL;
if (!redisUrl) {
  throw new Error("REDIS_URL is required for Redis integration tests.");
}

const delay = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

jest.setTimeout(30_000);

describe("Redis/cache infrastructure foundation", () => {
  let redis: RedisInfrastructureClient;
  let cache: CacheService;
  let lock: RedisDistributedLock;
  let rateLimitStore: RedisRateLimitCounterStore;
  let keys: RedisKeyBuilder;
  const testId = randomUUID();

  beforeAll(async () => {
    redis = new NodeRedisInfrastructureClient({
      url: redisUrl,
      connectTimeoutMs: 1_000,
    });
    expect(await redis.connect()).toBe(true);
    keys = new RedisKeyBuilder("sunshine");
    cache = new CacheService(redis, keys);
    lock = new RedisDistributedLock(redis, keys);
    rateLimitStore = new RedisRateLimitCounterStore(redis, keys);
  });

  afterAll(async () => {
    await Promise.allSettled([
      cache?.delete(`structured-${testId}`),
      cache?.delete(`ttl-${testId}`),
      rateLimitStore?.reset(`client-${testId}`),
    ]);
    await redis?.disconnect();
  });

  it("connects, pings, and disconnects without exposing a raw client", async () => {
    const connection = new NodeRedisInfrastructureClient({
      url: redisUrl,
      connectTimeoutMs: 1_000,
    });
    expect(connection.enabled).toBe(true);
    expect(await connection.connect()).toBe(true);
    expect(connection.connected).toBe(true);
    expect(await connection.ping()).toBe(true);
    await connection.disconnect();
    expect(connection.connected).toBe(false);
  });

  it("handles disabled and unavailable Redis without unhandled failures", async () => {
    const disabled = new NodeRedisInfrastructureClient({
      connectTimeoutMs: 100,
    });
    expect(disabled.enabled).toBe(false);
    expect(await disabled.connect()).toBe(false);
    expect(await disabled.ping()).toBe(false);
    await expect(disabled.get("sunshine:cache:test")).rejects.toBeInstanceOf(
      RedisUnavailableError,
    );

    const unavailable = new NodeRedisInfrastructureClient({
      url: "redis://127.0.0.1:1",
      connectTimeoutMs: 100,
    });
    expect(await unavailable.connect()).toBe(false);
    expect(await unavailable.ping()).toBe(false);
    await unavailable.disconnect();
  });

  it("stores typed JSON values with namespace, TTL, delete, exists, and normal misses", async () => {
    const structuredKey = `structured-${testId}`;
    const value = Object.freeze({ enabled: true, count: 2 });
    expect(keys.cache(structuredKey)).toBe(`sunshine:cache:${structuredKey}`);
    await expect(cache.get(structuredKey)).resolves.toBeNull();
    await cache.set(structuredKey, value, 5_000);
    await expect(cache.exists(structuredKey)).resolves.toBe(true);
    await expect(cache.get<typeof value>(structuredKey)).resolves.toEqual(value);
    await expect(cache.delete(structuredKey)).resolves.toBe(true);
    await expect(cache.get(structuredKey)).resolves.toBeNull();

    const ttlKey = `ttl-${testId}`;
    await cache.set(ttlKey, { temporary: true }, 100);
    await delay(200);
    await expect(cache.get(ttlKey)).resolves.toBeNull();
  });

  it("rejects credential-shaped Redis key segments", () => {
    expect(() => keys.cache("refresh-token-value")).toThrow(
      "Redis key segment is unsafe.",
    );
    expect(() => keys.lock("password-reset")).toThrow(
      "Redis key segment is unsafe.",
    );
  });

  it("acquires a lease once, permits owner-only release, and expires safely", async () => {
    const resource = `foundation-${testId}`;
    const handle = await lock.acquire(resource, 5_000);
    expect(handle).not.toBeNull();
    await expect(lock.acquire(resource, 5_000)).resolves.toBeNull();
    await expect(
      lock.release({
        key: handle!.key,
        ownerToken: randomUUID(),
      }),
    ).resolves.toBe(false);
    await expect(redis.exists(handle!.key)).resolves.toBe(true);
    await expect(lock.release(handle!)).resolves.toBe(true);

    const expiringResource = `expiring-${testId}`;
    const expiredHandle = await lock.acquire(expiringResource, 100);
    expect(expiredHandle).not.toBeNull();
    await delay(200);
    const replacementHandle = await lock.acquire(expiringResource, 5_000);
    expect(replacementHandle?.ownerToken).not.toBe(expiredHandle?.ownerToken);
    await expect(lock.release(replacementHandle!)).resolves.toBe(true);
  });

  it("provides an atomic namespaced counter boundary for future rate limiting", async () => {
    const identifier = `client-${testId}`;
    expect(keys.rateLimit(identifier)).toBe(
      `sunshine:ratelimit:${identifier}`,
    );
    await expect(rateLimitStore.increment(identifier, 5_000)).resolves.toMatchObject(
      { count: 1 },
    );
    await expect(rateLimitStore.increment(identifier, 5_000)).resolves.toMatchObject(
      { count: 2 },
    );
    await expect(rateLimitStore.reset(identifier)).resolves.toBe(true);
  });
});
