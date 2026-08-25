import type { OpenAPIV3 } from "openapi-types";
import { z } from "zod";
import { zodToOpenApiSchema } from "./zod-to-openapi.js";

const healthResponseSchema = z.object({
  status: z.literal("ok"),
});

const databaseHealthResponseSchema = healthResponseSchema.extend({
  database: z.literal("connected"),
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

export const openApiSchemas = {
  HealthResponse: zodToOpenApiSchema(healthResponseSchema, "output"),
  DatabaseHealthResponse: zodToOpenApiSchema(
    databaseHealthResponseSchema,
    "output",
  ),
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
} satisfies Record<string, OpenAPIV3.SchemaObject>;
