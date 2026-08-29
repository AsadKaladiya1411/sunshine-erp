import type { RequestHandler } from "express";
import {
  getDatabaseHealth,
  getRedisHealth,
  getStorageHealth,
} from "../controllers/health.controller.js";

export const healthHandler: RequestHandler = (req, res, next) =>
  getDatabaseHealth(req, res, next);

export const redisHealthHandler: RequestHandler = (req, res, next) =>
  getRedisHealth(req, res, next);

export const storageHealthHandler: RequestHandler = (req, res, next) =>
  getStorageHealth(req, res, next);
