export class AppError extends Error {
  constructor(
    public readonly code: string,
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export type ValidationSource = "body" | "params" | "query";

export interface ValidationErrorDetail {
  readonly source: ValidationSource;
  readonly path: readonly (string | number)[];
  readonly message: string;
}

export class ValidationError extends AppError {
  constructor(
    public readonly details: readonly ValidationErrorDetail[],
    message = "Request validation failed.",
  ) {
    super("VALIDATION_ERROR", 400, message);
  }
}

export class AuthenticationError extends AppError {
  constructor(message = "Authentication required") {
    super("AUTHENTICATION_ERROR", 401, message);
  }
}

export class AuthorizationError extends AppError {
  constructor(message = "You are not authorized to perform this action") {
    super("AUTHORIZATION_ERROR", 403, message);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Resource not found") {
    super("NOT_FOUND", 404, message);
  }
}

export class ConflictError extends AppError {
  constructor(message = "Resource conflict") {
    super("CONFLICT", 409, message);
  }
}

export class CorsOriginError extends AppError {
  constructor(message = "Request origin is not allowed.") {
    super("CORS_ORIGIN_DENIED", 403, message);
  }
}

export class RateLimitError extends AppError {
  constructor(message = "Too many requests. Please try again later.") {
    super("RATE_LIMIT_EXCEEDED", 429, message);
  }
}

export class PayloadTooLargeError extends AppError {
  constructor(message = "Request payload is too large.") {
    super("PAYLOAD_TOO_LARGE", 413, message);
  }
}

export class MalformedJsonError extends AppError {
  constructor(message = "Request body contains malformed JSON.") {
    super("MALFORMED_JSON", 400, message);
  }
}
