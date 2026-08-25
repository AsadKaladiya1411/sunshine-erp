import pino from "pino";
import { env } from "@sunshine-erp/config";
import { getRequestContext } from "../http/request-context.js";

export const logger = pino({
  level: env.LOG_LEVEL,
  mixin() {
    const requestContext = getRequestContext();

    return requestContext
      ? { correlationId: requestContext.correlationId }
      : {};
  },
});
