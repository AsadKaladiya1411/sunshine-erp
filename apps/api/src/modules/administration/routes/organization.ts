import { Router } from "express";
import { validateRequest } from "../../../core/middleware/validate-request.middleware.js";
import { authenticationMiddleware } from "../../auth/middleware/authentication.middleware.js";
import { requirePermission } from "../../authorization/middleware/require-permission.middleware.js";
import {
  getCurrentOrganization,
  updateCurrentOrganization,
} from "../controllers/organization.controller.js";
import { ORGANIZATION_MANAGEMENT_PERMISSION } from "../types/organization.types.js";
import { updateOrganizationRequestSchemas } from "../validation/organization.schemas.js";

export const organizationRouter = Router();

organizationRouter.use(
  authenticationMiddleware,
  requirePermission(ORGANIZATION_MANAGEMENT_PERMISSION),
);
organizationRouter.get("/", getCurrentOrganization);
organizationRouter.patch(
  "/",
  validateRequest(updateOrganizationRequestSchemas),
  updateCurrentOrganization,
);
