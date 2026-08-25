import { Router } from "express";
import { validateRequest } from "../../../core/middleware/validate-request.middleware.js";
import {
  changePassword,
  login,
  logout,
  me,
  refresh,
} from "../controllers/auth.controller.js";
import { authenticationMiddleware } from "../middleware/authentication.middleware.js";
import { trustedOriginMiddleware } from "../middleware/trusted-origin.middleware.js";
import {
  changePasswordRequestSchemas,
  loginRequestSchemas,
} from "../validation/auth.schemas.js";

export const authRouter = Router();

authRouter.post("/login", validateRequest(loginRequestSchemas), login);
authRouter.post("/refresh", trustedOriginMiddleware, refresh);
authRouter.post(
  "/logout",
  trustedOriginMiddleware,
  authenticationMiddleware,
  logout,
);
authRouter.get("/me", authenticationMiddleware, me);
authRouter.post(
  "/change-password",
  authenticationMiddleware,
  validateRequest(changePasswordRequestSchemas),
  changePassword,
);
