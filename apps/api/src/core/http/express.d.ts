import type { RequestContext } from "./request-context.js";

declare global {
  namespace Express {
    interface Request {
      requestContext?: RequestContext;
    }
  }
}

export {};
