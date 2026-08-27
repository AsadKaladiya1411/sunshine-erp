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

// The approved current security contract remains per process. The
// RateLimitCounterStore boundary in core/cache is available for a future,
// explicitly approved distributed-store integration.
export const apiRateLimitMiddleware = createApiRateLimitMiddleware({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  limit: env.RATE_LIMIT_MAX_REQUESTS,
});
