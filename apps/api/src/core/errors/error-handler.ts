import type { ErrorRequestHandler } from "express";
import { logger } from "../logging/logger.js";
import { AppError } from "../http/errors.js";

export const errorHandler: ErrorRequestHandler = (
  error,
  _req,
  res,
  _next,
) => {
  if (error instanceof AppError) {
    logger.warn(
      {
        code: error.code,
        statusCode: error.statusCode,
      },
      error.message,
    );

    res.status(error.statusCode).json({
      success: false,
      error: {
        code: error.code,
        message: error.message,
      },
    });

    return;
  }

  logger.error({ err: error }, "Unhandled API error");

  res.status(500).json({
    success: false,
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: "An unexpected error occurred.",
    },
  });
};