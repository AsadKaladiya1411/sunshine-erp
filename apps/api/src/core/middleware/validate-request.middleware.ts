import type { Request, RequestHandler } from "express";
import { z } from "zod";
import {
  ValidationError,
  type ValidationErrorDetail,
  type ValidationSource,
} from "../http/errors.js";

const validationSources = ["params", "query", "body"] as const;

export type RequestValidationSchemas = Partial<
  Record<ValidationSource, z.ZodType>
>;

export type ValidatedRequestData<TSchemas extends RequestValidationSchemas> = {
  readonly [TSource in keyof TSchemas]: TSchemas[TSource] extends z.ZodType
    ? z.output<TSchemas[TSource]>
    : never;
};

function getRequestValue(request: Request, source: ValidationSource): unknown {
  if (source === "body") {
    return request.body as unknown;
  }

  return request[source];
}

function normalizePathSegment(segment: PropertyKey): string | number {
  if (typeof segment === "symbol") {
    return segment.description ?? segment.toString();
  }

  return segment;
}

export function validateRequest<
  const TSchemas extends RequestValidationSchemas,
>(schemas: TSchemas): RequestHandler {
  return async (request, _response, next) => {
    try {
      const validatedRequest: Partial<Record<ValidationSource, unknown>> = {};
      const validationDetails: ValidationErrorDetail[] = [];

      for (const source of validationSources) {
        const schema = schemas[source];

        if (!schema) {
          continue;
        }

        const result = await schema.safeParseAsync(
          getRequestValue(request, source),
        );

        if (result.success) {
          validatedRequest[source] = result.data;
          continue;
        }

        validationDetails.push(
          ...result.error.issues.map((issue) => ({
            source,
            path: issue.path.map(normalizePathSegment),
            message: issue.message,
          })),
        );
      }

      if (validationDetails.length > 0) {
        next(new ValidationError(validationDetails));
        return;
      }

      request.validatedRequest = Object.freeze(validatedRequest);
      next();
    } catch (error: unknown) {
      next(error);
    }
  };
}

export function getValidatedRequest<
  const TSchemas extends RequestValidationSchemas,
>(request: Request, schemas: TSchemas): ValidatedRequestData<TSchemas> {
  const validatedRequest = request.validatedRequest;

  if (!validatedRequest) {
    throw new Error("Validated request data is unavailable.");
  }

  for (const source of validationSources) {
    if (schemas[source] && !(source in validatedRequest)) {
      throw new Error(`Validated ${source} data is unavailable.`);
    }
  }

  return validatedRequest as ValidatedRequestData<TSchemas>;
}
