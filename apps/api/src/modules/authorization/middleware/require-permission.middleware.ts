import type { RequestHandler } from "express";
import {
  AuthenticationError,
  AuthorizationError,
} from "../../../core/http/errors.js";
import { isAuthenticatedRequestContext } from "../../../core/http/request-context.js";
import { authorizationService } from "../services/authorization.service.js";

export interface PermissionAuthorizer {
  requirePermission(
    userId: string,
    organizationId: string,
    permission: string,
  ): Promise<void>;
}

export function createRequirePermission(
  authorizer: PermissionAuthorizer = authorizationService,
): (permission: string) => RequestHandler {
  return (permission: string): RequestHandler => {
    if (permission.length === 0) {
      throw new AuthorizationError();
    }

    return async (request, _response, next) => {
      try {
        if (!isAuthenticatedRequestContext(request.requestContext)) {
          throw new AuthenticationError();
        }

        await authorizer.requirePermission(
          request.requestContext.userId,
          request.requestContext.organizationId,
          permission,
        );
        next();
      } catch (error: unknown) {
        next(error);
      }
    };
  };
}

export const requirePermission = createRequirePermission();
