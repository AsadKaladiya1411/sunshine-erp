import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";
import {
  runWithRequestContext,
  type RequestContext,
} from "../http/request-context.js";

const CORRELATION_ID_HEADER = "X-Correlation-ID";

export const correlationIdMiddleware: RequestHandler = (req, res, next) => {
  const incomingCorrelationId = req.get(CORRELATION_ID_HEADER)?.trim();
  const correlationId = incomingCorrelationId || randomUUID();
  const requestContext: RequestContext = Object.freeze({ correlationId });

  req.requestContext = requestContext;
  res.setHeader(CORRELATION_ID_HEADER, correlationId);

  runWithRequestContext(requestContext, next);
};
