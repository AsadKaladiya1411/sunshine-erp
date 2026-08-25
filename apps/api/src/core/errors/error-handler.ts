import type { ErrorRequestHandler } from "express";
import { logger } from "../logging/logger.js";
import {
  AppError,
  MalformedJsonError,
  PayloadTooLargeError,
  ValidationError,
} from "../http/errors.js";

function hasRequestParsingProperties(
  error: unknown,
): error is { status?: unknown; type?: unknown } {
  return typeof error === "object" && error !== null;
}

function normalizeRequestError(error: unknown): unknown {
  if (!hasRequestParsingProperties(error)) {
    return error;
  }

  if (error.status === 413 || error.type === "entity.too.large") {
    return new PayloadTooLargeError();
  }

  if (error.status === 400 && error.type === "entity.parse.failed") {
    return new MalformedJsonError();
  }

  return error;
}

export const errorHandler: ErrorRequestHandler = (
  error: unknown,
  _req,
  res,
  _next,
) => {
  const normalizedError = normalizeRequestError(error);

  if (normalizedError instanceof AppError) {
    logger.warn(
      {
        code: normalizedError.code,
        statusCode: normalizedError.statusCode,
      },
      normalizedError.message,
    );

    const errorBody: {
      code: string;
      message: string;
      details?: ValidationError["details"];
    } = {
      code: normalizedError.code,
      message: normalizedError.message,
    };

    if (normalizedError instanceof ValidationError) {
      errorBody.details = normalizedError.details;
    }

    res.status(normalizedError.statusCode).json({
      success: false,
      error: errorBody,
    });

    return;
  }

  logger.error({ err: normalizedError }, "Unhandled API error");

  res.status(500).json({
    success: false,
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: "An unexpected error occurred.",
    },
  });
};
