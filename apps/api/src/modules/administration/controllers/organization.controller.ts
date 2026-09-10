import type { Request, RequestHandler } from "express";
import { getActivityRequestMetadata } from "../../../core/audit/request-metadata.js";
import { AuthenticationError } from "../../../core/http/errors.js";
import {
  isAuthenticatedRequestContext,
  type AuthenticatedRequestContext,
} from "../../../core/http/request-context.js";
import { sendSuccess } from "../../../core/http/response.js";
import { getValidatedRequest } from "../../../core/middleware/validate-request.middleware.js";
import { organizationService } from "../services/organization.service.js";
import { updateOrganizationRequestSchemas } from "../validation/organization.schemas.js";

function getAuthenticatedContext(
  request: Request,
): AuthenticatedRequestContext {
  if (!isAuthenticatedRequestContext(request.requestContext)) {
    throw new AuthenticationError();
  }
  return request.requestContext;
}

export const getCurrentOrganization: RequestHandler = async (
  request,
  response,
  next,
) => {
  try {
    const context = getAuthenticatedContext(request);
    const organization = await organizationService.getCurrentOrganization(
      context.organizationId,
    );
    sendSuccess(response, organization);
  } catch (error: unknown) {
    next(error);
  }
};

export const updateCurrentOrganization: RequestHandler = async (
  request,
  response,
  next,
) => {
  try {
    const context = getAuthenticatedContext(request);
    const { body } = getValidatedRequest(
      request,
      updateOrganizationRequestSchemas,
    );
    const organization = await organizationService.updateCurrentOrganization({
      organizationId: context.organizationId,
      updatedById: context.userId,
      changes: body,
      ...getActivityRequestMetadata(request),
    });
    sendSuccess(response, organization);
  } catch (error: unknown) {
    next(error);
  }
};
