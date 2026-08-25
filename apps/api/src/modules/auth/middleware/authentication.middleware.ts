import type { RequestHandler } from "express";
import { accessTokenService } from "../../../core/auth/access-token.service.js";
import { AuthenticationError } from "../../../core/http/errors.js";
import {
  getRequestContext,
  runWithRequestContext,
  type AuthenticatedRequestContext,
} from "../../../core/http/request-context.js";
import { sessionService } from "../services/session.service.js";

function readBearerToken(authorization: string | undefined): string {
  const match = authorization?.match(/^Bearer\s+([^\s]+)$/i);

  if (!match?.[1]) {
    throw new AuthenticationError();
  }

  return match[1];
}

export const authenticationMiddleware: RequestHandler = async (
  request,
  _response,
  next,
) => {
  try {
    const token = readBearerToken(request.get("Authorization"));
    const tokenIdentity = await accessTokenService.verify(token);
    await sessionService.validate(
      tokenIdentity.sessionId,
      tokenIdentity.userId,
      tokenIdentity.organizationId,
    );

    const currentContext = request.requestContext ?? getRequestContext();

    if (!currentContext) {
      throw new AuthenticationError();
    }

    const authenticatedContext: AuthenticatedRequestContext = Object.freeze({
      correlationId: currentContext.correlationId,
      userId: tokenIdentity.userId,
      organizationId: tokenIdentity.organizationId,
      sessionId: tokenIdentity.sessionId,
    });

    request.requestContext = authenticatedContext;
    runWithRequestContext(authenticatedContext, next);
  } catch (error: unknown) {
    next(error);
  }
};
