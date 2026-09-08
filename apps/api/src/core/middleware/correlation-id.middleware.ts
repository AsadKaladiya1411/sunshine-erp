import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";
import {
  runWithRequestContext,
  type RequestContext,
} from "../http/request-context.js";

const CORRELATION_ID_HEADER = "X-Correlation-ID";
const CORRELATION_ID_MAX_LENGTH = 255;
const correlationIdPattern = /^[A-Za-z0-9._:-]+$/;

function isValidCorrelationId(value: string | undefined): value is string {
  return Boolean(
    value &&
      value.length <= CORRELATION_ID_MAX_LENGTH &&
      correlationIdPattern.test(value),
  );
}

export const correlationIdMiddleware: RequestHandler = (req, res, next) => {
  const incomingCorrelationId = req.get(CORRELATION_ID_HEADER)?.trim();
  const correlationId = isValidCorrelationId(incomingCorrelationId)
    ? incomingCorrelationId
    : randomUUID();
  const requestContext: RequestContext = Object.freeze({ correlationId });

  req.requestContext = requestContext;
  res.setHeader(CORRELATION_ID_HEADER, correlationId);

  runWithRequestContext(requestContext, next);
};
