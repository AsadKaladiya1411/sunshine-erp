import type { RequestHandler } from "express";
import { getDatabaseHealth } from "../controllers/health.controller.js";

export const healthHandler: RequestHandler = (req, res, next) =>
  getDatabaseHealth(req, res, next);
