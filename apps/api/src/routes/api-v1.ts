import { Router } from "express";
import { apiNotFoundHandler } from "../core/middleware/api-not-found.middleware.js";
import { authRouter } from "../modules/auth/routes/auth.js";

export const apiV1Router = Router();

apiV1Router.use("/auth", authRouter);

// Future version 1 business routes are registered here.

apiV1Router.use(apiNotFoundHandler);
