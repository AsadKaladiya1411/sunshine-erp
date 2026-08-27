import type { RequestHandler } from "express";
import {
  getHealthStatus,
  getRedisHealthStatus,
} from "../services/health.service.js";

export const getDatabaseHealth: RequestHandler = async (_req, res, next) => {
  try {
    const health = await getHealthStatus();

    res.json(health);
  } catch (error: unknown) {
    next(error);
  }
};

export const getRedisHealth: RequestHandler = async (_req, res, next) => {
  try {
    res.json(await getRedisHealthStatus());
  } catch (error: unknown) {
    next(error);
  }
};
