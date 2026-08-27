import type { OpenAPIV3 } from "openapi-types";
import { z } from "zod";
import { zodToOpenApiSchema } from "./zod-to-openapi.js";
import {
  changePasswordBodySchema,
  loginBodySchema,
} from "../../modules/auth/validation/auth.schemas.js";

const healthResponseSchema = z.object({
  status: z.literal("ok"),
});

const databaseHealthResponseSchema = healthResponseSchema.extend({
  database: z.literal("connected"),
});

const redisHealthResponseSchema = healthResponseSchema.extend({
  redis: z.literal("connected"),
});

const standardErrorResponseSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});

const validationErrorDetailSchema = z.object({
  source: z.enum(["body", "params", "query"]),
  path: z.array(z.union([z.string(), z.number()])),
  message: z.string(),
});

const validationErrorResponseSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.literal("VALIDATION_ERROR"),
    message: z.string(),
    details: z.array(validationErrorDetailSchema),
  }),
});

const authenticatedUserIdentitySchema = z.object({
  userId: z.string().uuid(),
  organizationId: z.string().uuid(),
  organizationCode: z.string(),
  organizationName: z.string(),
  departmentId: z.string().uuid(),
  departmentCode: z.string(),
  departmentName: z.string(),
  sessionId: z.string().uuid(),
  username: z.string(),
  email: z.string().email(),
  firstName: z.string(),
  lastName: z.string().nullable(),
});

const accessTokenDataSchema = z.object({
  accessToken: z.string(),
  tokenType: z.literal("Bearer"),
  expiresIn: z.number().int().positive(),
});

const loginResponseSchema = z.object({
  success: z.literal(true),
  data: accessTokenDataSchema.extend({
    user: authenticatedUserIdentitySchema,
  }),
});

const refreshResponseSchema = z.object({
  success: z.literal(true),
  data: accessTokenDataSchema,
});

const authenticatedUserResponseSchema = z.object({
  success: z.literal(true),
  data: authenticatedUserIdentitySchema,
});

const logoutResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({ loggedOut: z.literal(true) }),
});

const changePasswordResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({ passwordChanged: z.literal(true) }),
});

export const openApiSchemas = {
  HealthResponse: zodToOpenApiSchema(healthResponseSchema, "output"),
  DatabaseHealthResponse: zodToOpenApiSchema(
    databaseHealthResponseSchema,
    "output",
  ),
  RedisHealthResponse: zodToOpenApiSchema(redisHealthResponseSchema, "output"),
  StandardErrorResponse: zodToOpenApiSchema(
    standardErrorResponseSchema,
    "output",
  ),
  ValidationErrorDetail: zodToOpenApiSchema(
    validationErrorDetailSchema,
    "output",
  ),
  ValidationErrorResponse: zodToOpenApiSchema(
    validationErrorResponseSchema,
    "output",
  ),
  LoginRequest: zodToOpenApiSchema(loginBodySchema),
  ChangePasswordRequest: zodToOpenApiSchema(changePasswordBodySchema),
  AuthenticatedUserIdentity: zodToOpenApiSchema(
    authenticatedUserIdentitySchema,
    "output",
  ),
  LoginResponse: zodToOpenApiSchema(loginResponseSchema, "output"),
  RefreshResponse: zodToOpenApiSchema(refreshResponseSchema, "output"),
  AuthenticatedUserResponse: zodToOpenApiSchema(
    authenticatedUserResponseSchema,
    "output",
  ),
  LogoutResponse: zodToOpenApiSchema(logoutResponseSchema, "output"),
  ChangePasswordResponse: zodToOpenApiSchema(
    changePasswordResponseSchema,
    "output",
  ),
} satisfies Record<string, OpenAPIV3.SchemaObject>;
