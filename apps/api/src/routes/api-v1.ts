import { Router } from "express";
import { apiNotFoundHandler } from "../core/middleware/api-not-found.middleware.js";
import { organizationRouter } from "../modules/administration/routes/organization.js";
import { authRouter } from "../modules/auth/routes/auth.js";

export const apiV1Router = Router();

apiV1Router.use("/auth", authRouter);
apiV1Router.use("/administration/organization", organizationRouter);

apiV1Router.use(apiNotFoundHandler);
