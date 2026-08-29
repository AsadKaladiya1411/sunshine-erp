export type BusinessRuleErrorCode =
  | "RULE_DEFINITION_INVALID"
  | "RULE_DUPLICATE"
  | "RULE_NOT_FOUND"
  | "RULE_DISABLED"
  | "RULE_EVALUATION_FAILED";

export class BusinessRuleError extends Error {
  constructor(
    public readonly code: BusinessRuleErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "BusinessRuleError";
  }
}

export class RuleDefinitionInvalidError extends BusinessRuleError {
  constructor() {
    super("RULE_DEFINITION_INVALID", "Business rule definition is invalid.");
  }
}

export class DuplicateRuleError extends BusinessRuleError {
  constructor() {
    super(
      "RULE_DUPLICATE",
      "Business rule identity and version already exist.",
    );
  }
}

export class RuleNotFoundError extends BusinessRuleError {
  constructor() {
    super("RULE_NOT_FOUND", "Business rule was not found.");
  }
}

export class RuleDisabledError extends BusinessRuleError {
  constructor() {
    super("RULE_DISABLED", "Business rule is disabled.");
  }
}

export class RuleEvaluationFailedError extends BusinessRuleError {
  constructor() {
    super("RULE_EVALUATION_FAILED", "Business rule evaluation failed.");
  }
}
