import {
  redisClient,
  type RedisInfrastructureClient,
} from "./redis-client.js";
import {
  redisKeyBuilder,
  type RedisKeyBuilder,
} from "./redis-key-builder.js";

export class CacheService {
  constructor(
    private readonly redis: RedisInfrastructureClient = redisClient,
    private readonly keys: RedisKeyBuilder = redisKeyBuilder,
  ) {}

  async get<T>(key: string): Promise<T | null> {
    const namespacedKey = this.keys.cache(key);
    const serialized = await this.redis.get(namespacedKey);
    if (serialized === null) {
      return null;
    }

    try {
      return JSON.parse(serialized) as T;
    } catch {
      await this.redis.delete(namespacedKey);
      return null;
    }
  }

  async set<T>(key: string, value: T, ttlMs: number): Promise<void> {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) {
      throw new TypeError("Cache values must be JSON serializable.");
    }
    await this.redis.set(this.keys.cache(key), serialized, ttlMs);
  }

  delete(key: string): Promise<boolean> {
    return this.redis.delete(this.keys.cache(key));
  }

  exists(key: string): Promise<boolean> {
    return this.redis.exists(this.keys.cache(key));
  }
}

export const cacheService = new CacheService();
