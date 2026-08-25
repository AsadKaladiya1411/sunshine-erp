import { Router } from "express";
import { apiNotFoundHandler } from "../core/middleware/api-not-found.middleware.js";

export const apiV1Router = Router();

// Future version 1 business routes are registered here.

apiV1Router.use(apiNotFoundHandler);
