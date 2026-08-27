import { randomUUID } from "node:crypto";
import {
  redisClient,
  type RedisInfrastructureClient,
} from "./redis-client.js";
import {
  redisKeyBuilder,
  type RedisKeyBuilder,
} from "./redis-key-builder.js";

export interface DistributedLockHandle {
  readonly key: string;
  readonly ownerToken: string;
}

export interface DistributedLock {
  acquire(resource: string, leaseMs: number): Promise<DistributedLockHandle | null>;
  release(handle: DistributedLockHandle): Promise<boolean>;
}

export class RedisDistributedLock implements DistributedLock {
  constructor(
    private readonly redis: RedisInfrastructureClient = redisClient,
    private readonly keys: RedisKeyBuilder = redisKeyBuilder,
  ) {}

  async acquire(
    resource: string,
    leaseMs: number,
  ): Promise<DistributedLockHandle | null> {
    const key = this.keys.lock(resource);
    const ownerToken = randomUUID();
    const acquired = await this.redis.setIfAbsent(key, ownerToken, leaseMs);
    return acquired ? Object.freeze({ key, ownerToken }) : null;
  }

  release(handle: DistributedLockHandle): Promise<boolean> {
    return this.redis.deleteIfValue(handle.key, handle.ownerToken);
  }
}

export const distributedLock = new RedisDistributedLock();
