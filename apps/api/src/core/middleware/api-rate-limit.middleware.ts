import { env } from "@sunshine-erp/config";
import { rateLimit, type RateLimitRequestHandler } from "express-rate-limit";
import { RateLimitError } from "../http/errors.js";

export interface ApiRateLimitOptions {
  readonly windowMs: number;
  readonly limit: number;
}

export function createApiRateLimitMiddleware(
  options: ApiRateLimitOptions,
): RateLimitRequestHandler {
  return rateLimit({
    windowMs: options.windowMs,
    limit: options.limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    identifier: "api-v1",
    handler(_request, _response, next) {
      next(new RateLimitError());
    },
  });
}

// Temporary per-process limiter. Replace or extend its memory store when
// distributed rate limiting is approved with the Redis foundation.
export const apiRateLimitMiddleware = createApiRateLimitMiddleware({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  limit: env.RATE_LIMIT_MAX_REQUESTS,
});
