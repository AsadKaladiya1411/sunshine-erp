import { env } from "@sunshine-erp/config";

export type RedisKeyNamespace = "cache" | "lock" | "ratelimit";

const safeKeySegmentPattern = /^[A-Za-z0-9._-]+$/;
const sensitiveKeySegmentPattern =
  /password|authorization|cookie|access[_-]?token|refresh[_-]?token|reset[_-]?token|api[_-]?key|secret/i;

function assertSafeSegment(segment: string): void {
  if (
    segment.length === 0 ||
    segment.length > 200 ||
    !safeKeySegmentPattern.test(segment) ||
    sensitiveKeySegmentPattern.test(segment)
  ) {
    throw new Error("Redis key segment is unsafe.");
  }
}

export class RedisKeyBuilder {
  constructor(private readonly prefix: string = env.REDIS_KEY_PREFIX) {
    assertSafeSegment(prefix);
  }

  cache(...segments: readonly string[]): string {
    return this.build("cache", segments);
  }

  lock(...segments: readonly string[]): string {
    return this.build("lock", segments);
  }

  rateLimit(...segments: readonly string[]): string {
    return this.build("ratelimit", segments);
  }

  private build(
    namespace: RedisKeyNamespace,
    segments: readonly string[],
  ): string {
    if (segments.length === 0) {
      throw new Error("At least one Redis key segment is required.");
    }
    segments.forEach(assertSafeSegment);
    return [this.prefix, namespace, ...segments].join(":");
  }
}

export const redisKeyBuilder = new RedisKeyBuilder();
