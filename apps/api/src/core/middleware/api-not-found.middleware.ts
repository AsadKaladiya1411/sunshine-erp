import type { RequestHandler } from "express";
import { NotFoundError } from "../http/errors.js";

export const apiNotFoundHandler: RequestHandler = (_req, _res, next) => {
  next(new NotFoundError("API route not found"));
};
