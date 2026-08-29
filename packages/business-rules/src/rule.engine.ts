import {
  isRuleDefinition,
  type RuleDefinition,
  type RuleMetadata,
  type RuleResultValue,
} from "./rule.definition.js";
import {
  RuleDefinitionInvalidError,
  RuleDisabledError,
  RuleEvaluationFailedError,
} from "./rule.errors.js";

export interface RuleEvaluationResult<
  Result extends RuleResultValue = RuleResultValue,
> {
  readonly ruleId: string;
  readonly version: number;
  readonly matched: boolean;
  readonly result: Result;
  readonly metadata?: RuleMetadata;
}

function immutableResultValue(
  value: unknown,
  seen: WeakSet<object>,
  depth = 0,
): RuleResultValue {
  if (depth > 10) {
    throw new RuleEvaluationFailedError();
  }
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new RuleEvaluationFailedError();
    }
    return value;
  }
  if (typeof value !== "object" || seen.has(value)) {
    throw new RuleEvaluationFailedError();
  }

  seen.add(value);
  if (Array.isArray(value)) {
    if (value.length > 1_000) {
      throw new RuleEvaluationFailedError();
    }
    const result = value.map((item) =>
      immutableResultValue(item, seen, depth + 1),
    );
    return Object.freeze(result);
  }

  const prototype = Object.getPrototypeOf(value) as object | null;
  if (prototype !== Object.prototype && prototype !== null) {
    throw new RuleEvaluationFailedError();
  }
  const entries = Object.entries(value);
  if (entries.length > 100) {
    throw new RuleEvaluationFailedError();
  }

  const result: Record<string, RuleResultValue> = {};
  for (const [key, item] of entries) {
    if (key === "__proto__" || key === "constructor" || key === "prototype") {
      throw new RuleEvaluationFailedError();
    }
    result[key] = immutableResultValue(item, seen, depth + 1);
  }
  return Object.freeze(result);
}

export class BusinessRulesEngine {
  evaluate<Input, Context, Result extends RuleResultValue>(
    definition: RuleDefinition<Input, Context, Result>,
    input: Readonly<Input>,
    context: Readonly<Context>,
  ): RuleEvaluationResult<Result> {
    if (!isRuleDefinition(definition)) {
      throw new RuleDefinitionInvalidError();
    }
    if (!definition.enabled) {
      throw new RuleDisabledError();
    }

    try {
      const decision = definition.evaluator(input, context);
      if (
        typeof decision !== "object" ||
        decision === null ||
        typeof decision.matched !== "boolean" ||
        !("result" in decision)
      ) {
        throw new RuleEvaluationFailedError();
      }

      const result = immutableResultValue(
        decision.result,
        new WeakSet<object>(),
      ) as Result;
      return Object.freeze({
        ruleId: definition.ruleId,
        version: definition.version,
        matched: decision.matched,
        result,
        ...(definition.metadata ? { metadata: definition.metadata } : {}),
      });
    } catch {
      throw new RuleEvaluationFailedError();
    }
  }
}
