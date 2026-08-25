import type { RequestContext } from "./request-context.js";

declare global {
  namespace Express {
    interface Request {
      requestContext?: RequestContext;
      validatedRequest?: Partial<Record<"body" | "params" | "query", unknown>>;
    }
  }
}

export {};
