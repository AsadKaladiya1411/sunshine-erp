import { env } from "@sunshine-erp/config";
import type { RequestHandler } from "express";
import { CsrfOriginError } from "../../../core/http/errors.js";

const trustedOrigins = new Set(env.CORS_ALLOWED_ORIGINS);

export const trustedOriginMiddleware: RequestHandler = (
  request,
  _response,
  next,
) => {
  const origin = request.get("Origin");

  if (!origin || !trustedOrigins.has(origin)) {
    next(new CsrfOriginError());
    return;
  }

  next();
};
