import type { NextFunction, Request, Response } from "express";
import { describe, expect, it, jest } from "@jest/globals";
import { AuthorizationError } from "../../../core/http/errors.js";
import { createRequirePermission } from "./require-permission.middleware.js";

const protectedPermission = "system.health.read";

function requestWithContext(
  requestContext?: Request["requestContext"],
): Request {
  return {
    requestContext,
    ip: "127.0.0.1",
    get: jest.fn((header: string) =>
      header === "User-Agent" ? "RBAC-Test-Agent/1.0" : undefined,
    ),
    body: { organizationId: "client-supplied-organization" },
    query: { organizationId: "client-supplied-organization" },
    params: { organizationId: "client-supplied-organization" },
  } as unknown as Request;
}

async function invoke(
  handler: ReturnType<ReturnType<typeof createRequirePermission>>,
  request: Request,
  next: NextFunction,
): Promise<void> {
  await handler(request, {} as Response, next);
}

describe("requirePermission middleware", () => {
  it("returns 401 when immutable authentication context is absent", async () => {
    const authorizer = {
      requirePermission: jest.fn<() => Promise<void>>().mockResolvedValue(),
    };
    const nextMock = jest.fn();
    const audit = {
      recordAuthenticatedActivity: jest.fn<() => Promise<void>>().mockResolvedValue(),
    };
    const next = nextMock as unknown as NextFunction;
    const middleware = createRequirePermission(authorizer, audit)(protectedPermission);

    await invoke(middleware, requestWithContext(), next);

    expect(authorizer.requirePermission).not.toHaveBeenCalled();
    expect(audit.recordAuthenticatedActivity).not.toHaveBeenCalled();
    expect(nextMock).toHaveBeenCalledWith(
      expect.objectContaining({ code: "AUTHENTICATION_ERROR", statusCode: 401 }),
    );
  });

  it("returns 403 when the authenticated user lacks the permission", async () => {
    const authorizer = {
      requirePermission: jest
        .fn<() => Promise<void>>()
        .mockRejectedValue(new AuthorizationError()),
    };
    const nextMock = jest.fn();
    const audit = {
      recordAuthenticatedActivity: jest.fn<() => Promise<void>>().mockResolvedValue(),
    };
    const next = nextMock as unknown as NextFunction;
    const middleware = createRequirePermission(authorizer, audit)(protectedPermission);

    await invoke(
      middleware,
      requestWithContext(
        Object.freeze({
          correlationId: "rbac-test",
          userId: "user-a",
          organizationId: "organization-a",
          sessionId: "session-a",
        }),
      ),
      next,
    );

    expect(nextMock).toHaveBeenCalledWith(
      expect.objectContaining({ code: "AUTHORIZATION_ERROR", statusCode: 403 }),
    );
    expect(audit.recordAuthenticatedActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({
          userId: "user-a",
          organizationId: "organization-a",
        }),
        recordId: protectedPermission,
        action: "AuthorizationDenied",
        ipAddress: "127.0.0.1",
        userAgent: "RBAC-Test-Agent/1.0",
      }),
    );
  });

  it("calls next and ignores client-supplied organization identifiers when allowed", async () => {
    const authorizer = {
      requirePermission: jest.fn<() => Promise<void>>().mockResolvedValue(),
    };
    const nextMock = jest.fn();
    const audit = {
      recordAuthenticatedActivity: jest.fn<() => Promise<void>>().mockResolvedValue(),
    };
    const next = nextMock as unknown as NextFunction;
    const middleware = createRequirePermission(authorizer, audit)(protectedPermission);

    await invoke(
      middleware,
      requestWithContext(
        Object.freeze({
          correlationId: "rbac-test",
          userId: "user-a",
          organizationId: "organization-a",
          sessionId: "session-a",
        }),
      ),
      next,
    );

    expect(authorizer.requirePermission).toHaveBeenCalledWith(
      "user-a",
      "organization-a",
      protectedPermission,
    );
    expect(nextMock).toHaveBeenCalledWith();
    expect(audit.recordAuthenticatedActivity).not.toHaveBeenCalled();
  });
});
