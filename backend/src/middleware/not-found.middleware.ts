import type { Request, Response } from "express";

export function notFound(request: Request, response: Response): void {
  response.status(404).json({
    success: false,
    error: {
      code: "NOT_FOUND",
      message: `Route ${request.method} ${request.path} was not found.`,
    },
  });
}

