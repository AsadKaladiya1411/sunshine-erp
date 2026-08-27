import type { RequestHandler } from "express";
import {
  auditService,
} from "../../../core/audit/audit.service.js";
import type { RecordAuthenticatedActivityInput } from "../../../core/audit/activity-log.types.js";
import { SECURITY_ACTIVITY_ACTIONS } from "../../../core/audit/activity-log.types.js";
import { getActivityRequestMetadata } from "../../../core/audit/request-metadata.js";
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

export interface AuthenticatedActivityRecorder {
  recordAuthenticatedActivity(
    input: RecordAuthenticatedActivityInput,
  ): Promise<unknown>;
}

export function createRequirePermission(
  authorizer: PermissionAuthorizer = authorizationService,
  audit: AuthenticatedActivityRecorder = auditService,
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
        if (
          error instanceof AuthorizationError &&
          isAuthenticatedRequestContext(request.requestContext)
        ) {
          try {
            await audit.recordAuthenticatedActivity({
              context: request.requestContext,
              module: "Authorization",
              entityName: "Permission",
              recordId: permission,
              action: SECURITY_ACTIVITY_ACTIONS.authorizationDenied,
              ...getActivityRequestMetadata(request),
              remarks: "Permission check denied.",
            });
          } catch (auditError: unknown) {
            next(auditError);
            return;
          }
        }
        next(error);
      }
    };
  };
}

export const requirePermission = createRequirePermission();
