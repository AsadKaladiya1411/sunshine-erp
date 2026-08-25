import { Router } from "express";
import { apiNotFoundHandler } from "../core/middleware/api-not-found.middleware.js";
import { correlationIdMiddleware } from "../core/middleware/correlation-id.middleware.js";

export const apiV1Router = Router();

apiV1Router.use(correlationIdMiddleware);

// Future version 1 business routes are registered here.

apiV1Router.use(apiNotFoundHandler);
