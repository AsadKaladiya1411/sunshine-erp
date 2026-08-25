import type { RequestHandler } from "express";
import { getHealthStatus } from "../services/health.service.js";

export const getDatabaseHealth: RequestHandler = async (_req, res, next) => {
  try {
    const health = await getHealthStatus();

    res.json(health);
  } catch (error: unknown) {
    next(error);
  }
};
