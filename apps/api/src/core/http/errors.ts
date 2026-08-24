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

export class ValidationError extends AppError {
  constructor(message = "Validation failed") {
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