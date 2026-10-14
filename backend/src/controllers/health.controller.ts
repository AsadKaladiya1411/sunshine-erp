import type { Request, Response } from "express";
import { getHealthStatus } from "../models/health.model.js";

export function getHealth(_request: Request, response: Response): void {
  response.status(200).json(getHealthStatus());
}

