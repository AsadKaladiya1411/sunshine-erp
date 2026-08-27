import { env } from "@sunshine-erp/config";
import { createClient } from "redis";
import { logger } from "../logging/logger.js";
import { RedisUnavailableError } from "./redis.errors.js";

type ManagedRedisClient = ReturnType<typeof createClient>;

export interface RedisClientConfiguration {
  readonly url?: string;
  readonly connectTimeoutMs: number;
}

export interface AtomicCounterResult {
  readonly count: number;
  readonly ttlMs: number;
}

export interface RedisInfrastructureClient {
  readonly enabled: boolean;
  readonly connected: boolean;
  connect(): Promise<boolean>;
  disconnect(): Promise<void>;
  ping(): Promise<boolean>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlMs?: number): Promise<void>;
  delete(key: string): Promise<boolean>;
  exists(key: string): Promise<boolean>;
  setIfAbsent(key: string, value: string, ttlMs: number): Promise<boolean>;
  deleteIfValue(key: string, expectedValue: string): Promise<boolean>;
  incrementWithExpiry(key: string, ttlMs: number): Promise<AtomicCounterResult>;
}

export type RedisClientFactory = () => ManagedRedisClient;

const ownerOnlyDeleteScript = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("DEL", KEYS[1])
end
return 0
`;

const incrementWithExpiryScript = `
local count = redis.call("INCR", KEYS[1])
local ttl = redis.call("PTTL", KEYS[1])
if count == 1 or ttl < 0 then
  redis.call("PEXPIRE", KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end
return { count, ttl }
`;

function positiveInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${label} must be a positive safe integer.`);
  }
  return value;
}

function safeErrorCode(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return error.code;
  }
  return "UNKNOWN";
}

export class NodeRedisInfrastructureClient
  implements RedisInfrastructureClient
{
  private client: ManagedRedisClient | undefined;

  constructor(
    private readonly configuration: RedisClientConfiguration,
    private readonly clientFactory: RedisClientFactory = () =>
      createClient({
        url: configuration.url,
        socket: {
          connectTimeout: configuration.connectTimeoutMs,
          reconnectStrategy: false,
        },
      }),
  ) {}

  get enabled(): boolean {
    return this.configuration.url !== undefined;
  }

  get connected(): boolean {
    return this.client?.isReady ?? false;
  }

  async connect(): Promise<boolean> {
    if (!this.enabled) {
      logger.info({ component: "redis" }, "Redis is not configured");
      return false;
    }
    if (this.connected) {
      return true;
    }

    const client = this.clientFactory();
    client.on("error", (error: Error) => {
      logger.warn(
        { component: "redis", errorCode: safeErrorCode(error) },
        "Redis client error",
      );
    });
    this.client = client;

    try {
      await client.connect();
      logger.info({ component: "redis" }, "Redis connected");
      return true;
    } catch (error: unknown) {
      logger.warn(
        { component: "redis", errorCode: safeErrorCode(error) },
        "Redis connection unavailable; continuing without cache infrastructure",
      );
      if (client.isOpen) {
        client.destroy();
      }
      this.client = undefined;
      return false;
    }
  }

  async disconnect(): Promise<void> {
    const client = this.client;
    this.client = undefined;
    if (!client?.isOpen) {
      return;
    }

    try {
      await client.close();
      logger.info({ component: "redis" }, "Redis disconnected");
    } catch (error: unknown) {
      client.destroy();
      logger.warn(
        { component: "redis", errorCode: safeErrorCode(error) },
        "Redis forced disconnect completed",
      );
    }
  }

  async ping(): Promise<boolean> {
    if (!this.connected) {
      return false;
    }
    try {
      return (await this.readyClient().ping()) === "PONG";
    } catch {
      return false;
    }
  }

  async get(key: string): Promise<string | null> {
    return await this.readyClient().get(key);
  }

  async set(key: string, value: string, ttlMs?: number): Promise<void> {
    if (ttlMs === undefined) {
      await this.readyClient().set(key, value);
      return;
    }
    await this.readyClient().set(key, value, {
      PX: positiveInteger(ttlMs, "ttlMs"),
    });
  }

  async delete(key: string): Promise<boolean> {
    return (await this.readyClient().del(key)) > 0;
  }

  async exists(key: string): Promise<boolean> {
    return (await this.readyClient().exists(key)) > 0;
  }

  async setIfAbsent(
    key: string,
    value: string,
    ttlMs: number,
  ): Promise<boolean> {
    const result = await this.readyClient().set(key, value, {
      NX: true,
      PX: positiveInteger(ttlMs, "ttlMs"),
    });
    return result === "OK";
  }

  async deleteIfValue(key: string, expectedValue: string): Promise<boolean> {
    const result = await this.readyClient().eval(ownerOnlyDeleteScript, {
      keys: [key],
      arguments: [expectedValue],
    });
    return Number(result) === 1;
  }

  async incrementWithExpiry(
    key: string,
    ttlMs: number,
  ): Promise<AtomicCounterResult> {
    const result = await this.readyClient().eval(incrementWithExpiryScript, {
      keys: [key],
      arguments: [String(positiveInteger(ttlMs, "ttlMs"))],
    });
    if (!Array.isArray(result) || result.length !== 2) {
      throw new Error("Redis returned an invalid atomic counter result.");
    }
    const count = Number(result[0]);
    const remainingTtlMs = Number(result[1]);
    if (!Number.isSafeInteger(count) || !Number.isSafeInteger(remainingTtlMs)) {
      throw new Error("Redis returned an invalid atomic counter value.");
    }
    return Object.freeze({ count, ttlMs: remainingTtlMs });
  }

  private readyClient(): ManagedRedisClient {
    if (!this.client?.isReady) {
      throw new RedisUnavailableError();
    }
    return this.client;
  }
}

export const redisClient = new NodeRedisInfrastructureClient({
  url: env.REDIS_URL,
  connectTimeoutMs: env.REDIS_CONNECT_TIMEOUT_MS,
});
