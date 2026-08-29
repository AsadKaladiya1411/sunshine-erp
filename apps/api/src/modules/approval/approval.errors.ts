import { AppError } from "../../core/http/errors.js";

export class ApprovalValidationError extends AppError {
  constructor(message = "Approval data is invalid.") {
    super("APPROVAL_VALIDATION_ERROR", 400, message);
    this.name = "ApprovalValidationError";
  }
}

export class ApprovalNotFoundError extends AppError {
  constructor(message = "Approval resource was not found.") {
    super("APPROVAL_NOT_FOUND", 404, message);
    this.name = "ApprovalNotFoundError";
  }
}

export class ApprovalAuthorizationError extends AppError {
  constructor(message = "User is not authorized for this approval action.") {
    super("APPROVAL_AUTHORIZATION_ERROR", 403, message);
    this.name = "ApprovalAuthorizationError";
  }
}

export class ApprovalStateConflictError extends AppError {
  constructor(message = "Approval state does not permit this operation.") {
    super("APPROVAL_STATE_CONFLICT", 409, message);
    this.name = "ApprovalStateConflictError";
  }
}

export class ApprovalDelegationAmbiguousError extends AppError {
  constructor() {
    super(
      "APPROVAL_DELEGATION_AMBIGUOUS",
      409,
      "Multiple delegations match and no approved precedence rule is configured.",
    );
    this.name = "ApprovalDelegationAmbiguousError";
  }
}
