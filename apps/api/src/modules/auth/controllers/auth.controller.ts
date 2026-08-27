import type { Request, RequestHandler } from "express";
import { getActivityRequestMetadata } from "../../../core/audit/request-metadata.js";
import {
  clearRefreshTokenCookie,
  readRefreshTokenCookie,
  setRefreshTokenCookie,
} from "../../../core/auth/refresh-cookie.js";
import { AuthenticationError, InvalidRefreshTokenError } from "../../../core/http/errors.js";
import {
  isAuthenticatedRequestContext,
  type AuthenticatedRequestContext,
} from "../../../core/http/request-context.js";
import { sendSuccess } from "../../../core/http/response.js";
import { getValidatedRequest } from "../../../core/middleware/validate-request.middleware.js";
import { authenticationService } from "../services/authentication.service.js";
import {
  changePasswordRequestSchemas,
  loginRequestSchemas,
} from "../validation/auth.schemas.js";

function getAuthenticatedContext(
  request: Request,
): AuthenticatedRequestContext {
  if (!isAuthenticatedRequestContext(request.requestContext)) {
    throw new AuthenticationError();
  }

  return request.requestContext;
}

export const login: RequestHandler = async (request, response, next) => {
  try {
    const { body } = getValidatedRequest(request, loginRequestSchemas);
    const metadata = getActivityRequestMetadata(request);
    const result = await authenticationService.login({
      organizationCode: body.organizationCode,
      username: body.username,
      email: body.email,
      password: body.password,
      ...metadata,
    });

    setRefreshTokenCookie(response, result.refreshToken);
    sendSuccess(response, {
      accessToken: result.accessToken,
      tokenType: "Bearer" as const,
      expiresIn: result.accessTokenExpiresIn,
      user: result.user,
    });
  } catch (error: unknown) {
    next(error);
  }
};

export const refresh: RequestHandler = async (request, response, next) => {
  try {
    const refreshToken = readRefreshTokenCookie(request);

    if (!refreshToken) {
      throw new InvalidRefreshTokenError();
    }

    const result = await authenticationService.refresh(
      refreshToken,
      getActivityRequestMetadata(request),
    );
    setRefreshTokenCookie(response, result.refreshToken);
    sendSuccess(response, {
      accessToken: result.accessToken,
      tokenType: "Bearer" as const,
      expiresIn: result.accessTokenExpiresIn,
    });
  } catch (error: unknown) {
    clearRefreshTokenCookie(response);
    next(error);
  }
};

export const logout: RequestHandler = async (request, response, next) => {
  try {
    const context = getAuthenticatedContext(request);
    await authenticationService.logout(
      context.sessionId,
      context.userId,
      context.organizationId,
      getActivityRequestMetadata(request),
    );
    clearRefreshTokenCookie(response);
    sendSuccess(response, { loggedOut: true });
  } catch (error: unknown) {
    clearRefreshTokenCookie(response);
    next(error);
  }
};

export const me: RequestHandler = async (request, response, next) => {
  try {
    const context = getAuthenticatedContext(request);
    const user = await authenticationService.getCurrentUser(
      context.sessionId,
      context.userId,
      context.organizationId,
    );
    sendSuccess(response, user);
  } catch (error: unknown) {
    next(error);
  }
};

export const changePassword: RequestHandler = async (
  request,
  response,
  next,
) => {
  try {
    const context = getAuthenticatedContext(request);
    const { body } = getValidatedRequest(
      request,
      changePasswordRequestSchemas,
    );
    await authenticationService.changePassword(
      context.userId,
      context.organizationId,
      context.sessionId,
      body.currentPassword,
      body.newPassword,
      getActivityRequestMetadata(request),
    );
    sendSuccess(response, { passwordChanged: true });
  } catch (error: unknown) {
    next(error);
  }
};
