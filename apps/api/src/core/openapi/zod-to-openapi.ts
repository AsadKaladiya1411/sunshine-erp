import type { OpenAPIV3 } from "openapi-types";
import { z } from "zod";

export function zodToOpenApiSchema(
  schema: z.ZodType,
  io: "input" | "output" = "input",
): OpenAPIV3.SchemaObject {
  return z.toJSONSchema(schema, {
    target: "openapi-3.0",
    io,
  }) as OpenAPIV3.SchemaObject;
}
