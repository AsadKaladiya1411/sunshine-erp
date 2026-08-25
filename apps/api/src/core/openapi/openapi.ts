import { env } from "@sunshine-erp/config";
import type { OpenAPIV3 } from "openapi-types";
import { openApiSchemas } from "./openapi.schemas.js";

const jsonContent = (schemaName: keyof typeof openApiSchemas) => ({
  "application/json": {
    schema: {
      $ref: `#/components/schemas/${schemaName}`,
    },
  },
});

export const openApiDocument: OpenAPIV3.Document = {
  openapi: "3.0.3",
  info: {
    title: "NO CHEAT ERP API",
    version: "1.0.0",
    description:
      "Sunshine Corporation NO CHEAT ERP API. Future business operations are registered under /api/v1. Versioned API requests accept X-Correlation-ID and echo it in the response; when absent, the API generates a unique correlation ID.",
  },
  servers: [
    {
      url: "http://localhost:4000",
      description: "Local development server",
    },
  ],
  tags: [
    {
      name: "System",
      description: "Infrastructure and application health checks.",
    },
    {
      name: "Authentication",
      description:
        "Organization-scoped authentication and authoritative PostgreSQL session management.",
    },
  ],
  paths: {
    "/api/v1": {
      description:
        "Version 1 API namespace. Future module operations are registered below this root.",
    },
    "/health": {
      get: {
        operationId: "getApplicationHealth",
        tags: ["System"],
        summary: "Check API liveness",
        description:
          "Confirms that the Express API process is running and able to respond.",
        responses: {
          "200": {
            description: "The API is running.",
            content: jsonContent("HealthResponse"),
          },
        },
      },
    },
    "/health/db": {
      get: {
        operationId: "getDatabaseHealth",
        tags: ["System"],
        summary: "Check PostgreSQL connectivity",
        description:
          "Confirms database connectivity through the repository and Prisma health flow.",
        responses: {
          "200": {
            description: "PostgreSQL is reachable.",
            content: jsonContent("DatabaseHealthResponse"),
          },
          "500": {
            $ref: "#/components/responses/InternalServerError",
          },
        },
      },
    },
    "/api/v1/auth/login": {
      post: {
        operationId: "login",
        tags: ["Authentication"],
        summary: "Authenticate an organization-scoped user",
        description:
          "Authenticates with Organization Code and exactly one of Username or Email. The response body contains a short-lived access JWT; the opaque refresh token is returned only through an HttpOnly cookie.",
        requestBody: {
          required: true,
          content: jsonContent("LoginRequest"),
        },
        responses: {
          "200": {
            description: "Authentication succeeded.",
            headers: {
              "Set-Cookie": {
                description: `Sets the HttpOnly ${env.REFRESH_COOKIE_NAME} refresh cookie.`,
                schema: { type: "string" },
              },
            },
            content: jsonContent("LoginResponse"),
          },
          "400": { $ref: "#/components/responses/ValidationError" },
          "401": { $ref: "#/components/responses/AuthenticationError" },
          "409": { $ref: "#/components/responses/Conflict" },
        },
      },
    },
    "/api/v1/auth/refresh": {
      post: {
        operationId: "refreshAccessToken",
        tags: ["Authentication"],
        summary: "Rotate the refresh token",
        description:
          "Requires the secure refresh cookie and a trusted Origin header. Normal CORS handling is not treated as CSRF protection. Successful rotation retires the presented token hash and replaces the cookie.",
        parameters: [
          { $ref: "#/components/parameters/TrustedOrigin" },
          { $ref: "#/components/parameters/RefreshTokenCookie" },
        ],
        responses: {
          "200": {
            description: "Refresh token rotated and a new access JWT issued.",
            headers: {
              "Set-Cookie": {
                description: "Replaces the HttpOnly refresh cookie.",
                schema: { type: "string" },
              },
            },
            content: jsonContent("RefreshResponse"),
          },
          "401": { $ref: "#/components/responses/AuthenticationError" },
          "403": { $ref: "#/components/responses/Forbidden" },
        },
      },
    },
    "/api/v1/auth/logout": {
      post: {
        operationId: "logout",
        tags: ["Authentication"],
        summary: "Log out the current session",
        description:
          "Requires bearer authentication and a trusted Origin header. The authoritative PostgreSQL session is invalidated and the refresh cookie is cleared.",
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: "#/components/parameters/TrustedOrigin" }],
        responses: {
          "200": {
            description: "The session was logged out.",
            content: jsonContent("LogoutResponse"),
          },
          "401": { $ref: "#/components/responses/AuthenticationError" },
          "403": { $ref: "#/components/responses/Forbidden" },
        },
      },
    },
    "/api/v1/auth/me": {
      get: {
        operationId: "getCurrentAuthenticatedUser",
        tags: ["Authentication"],
        summary: "Get the current authenticated identity",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": {
            description:
              "Authenticated user, organization, department, and session identity without credential fields.",
            content: jsonContent("AuthenticatedUserResponse"),
          },
          "401": { $ref: "#/components/responses/AuthenticationError" },
        },
      },
    },
    "/api/v1/auth/change-password": {
      post: {
        operationId: "changeCurrentUserPassword",
        tags: ["Authentication"],
        summary: "Change the current user's password",
        description:
          "Verifies the current password, enforces password history, preserves the previous hash, and revokes other active sessions.",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: jsonContent("ChangePasswordRequest"),
        },
        responses: {
          "200": {
            description: "Password changed successfully.",
            content: jsonContent("ChangePasswordResponse"),
          },
          "400": { $ref: "#/components/responses/ValidationError" },
          "401": { $ref: "#/components/responses/AuthenticationError" },
        },
      },
    },
  },
  components: {
    schemas: openApiSchemas,
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description:
          "Short-lived access JWT. Authorization remains subject to authoritative PostgreSQL User Session validation.",
      },
    },
    parameters: {
      CorrelationId: {
        name: "X-Correlation-ID",
        in: "header",
        required: false,
        description:
          "Optional request correlation ID. When supplied it is echoed in the response; otherwise the API generates a unique ID.",
        schema: {
          type: "string",
        },
      },
      TrustedOrigin: {
        name: "Origin",
        in: "header",
        required: true,
        description:
          "Must match a configured trusted browser origin for refresh-token cookie operations.",
        schema: { type: "string", format: "uri" },
      },
      RefreshTokenCookie: {
        name: env.REFRESH_COOKIE_NAME,
        in: "cookie",
        required: true,
        description:
          "Opaque refresh token. The cookie is HttpOnly and is not exposed to application JavaScript.",
        schema: { type: "string" },
      },
    },
    headers: {
      CorrelationId: {
        description:
          "The request correlation ID supplied by the client or generated by the API.",
        schema: {
          type: "string",
        },
      },
    },
    responses: {
      ValidationError: {
        description: "Request validation failed.",
        headers: {
          "X-Correlation-ID": {
            $ref: "#/components/headers/CorrelationId",
          },
        },
        content: jsonContent("ValidationErrorResponse"),
      },
      NotFound: {
        description: "The requested API resource was not found.",
        headers: {
          "X-Correlation-ID": {
            $ref: "#/components/headers/CorrelationId",
          },
        },
        content: jsonContent("StandardErrorResponse"),
      },
      InternalServerError: {
        description: "An unexpected server error occurred.",
        content: jsonContent("StandardErrorResponse"),
      },
      AuthenticationError: {
        description: "Authentication failed or the session is invalid.",
        content: jsonContent("StandardErrorResponse"),
      },
      Forbidden: {
        description: "The request is not allowed by the security boundary.",
        content: jsonContent("StandardErrorResponse"),
      },
      Conflict: {
        description: "Authentication state conflicts with the request.",
        content: jsonContent("StandardErrorResponse"),
      },
    },
  },
};
