import {
  redisClient,
  type AtomicCounterResult,
  type RedisInfrastructureClient,
} from "./redis-client.js";
import {
  redisKeyBuilder,
  type RedisKeyBuilder,
} from "./redis-key-builder.js";

export interface RateLimitCounterStore {
  increment(identifier: string, windowMs: number): Promise<AtomicCounterResult>;
  reset(identifier: string): Promise<boolean>;
}

export class RedisRateLimitCounterStore implements RateLimitCounterStore {
  constructor(
    private readonly redis: RedisInfrastructureClient = redisClient,
    private readonly keys: RedisKeyBuilder = redisKeyBuilder,
  ) {}

  increment(
    identifier: string,
    windowMs: number,
  ): Promise<AtomicCounterResult> {
    return this.redis.incrementWithExpiry(
      this.keys.rateLimit(identifier),
      windowMs,
    );
  }

  reset(identifier: string): Promise<boolean> {
    return this.redis.delete(this.keys.rateLimit(identifier));
  }
}

export const redisRateLimitCounterStore = new RedisRateLimitCounterStore();
