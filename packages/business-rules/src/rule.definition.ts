import { RuleDefinitionInvalidError } from "./rule.errors.js";

const ruleDefinitionBrand: unique symbol = Symbol("business-rule-definition");
const ruleIdentifierPattern = /^[A-Za-z][A-Za-z0-9._-]{0,99}$/;
const metadataKeyPattern = /^[A-Za-z][A-Za-z0-9._-]{0,63}$/;

export type RuleMetadataValue = string | number | boolean | null;
export type RuleMetadata = Readonly<Record<string, RuleMetadataValue>>;

export type RuleResultValue =
  | string
  | number
  | boolean
  | null
  | readonly RuleResultValue[]
  | { readonly [key: string]: RuleResultValue };

export interface RuleDecision<
  Result extends RuleResultValue = RuleResultValue,
> {
  readonly matched: boolean;
  readonly result: Result;
}

export type RuleEvaluator<
  Input,
  Context,
  Result extends RuleResultValue = RuleResultValue,
> = (
  input: Readonly<Input>,
  context: Readonly<Context>,
) => RuleDecision<Result>;

export interface RuleDefinitionInput<
  Input,
  Context,
  Result extends RuleResultValue = RuleResultValue,
> {
  readonly ruleId: string;
  readonly version: number;
  readonly enabled: boolean;
  readonly metadata?: RuleMetadata;
  readonly evaluator: RuleEvaluator<Input, Context, Result>;
}

export interface RuleDefinition<
  Input = unknown,
  Context = unknown,
  Result extends RuleResultValue = RuleResultValue,
> {
  readonly ruleId: string;
  readonly version: number;
  readonly enabled: boolean;
  readonly metadata?: RuleMetadata;
  readonly evaluator: RuleEvaluator<Input, Context, Result>;
  readonly [ruleDefinitionBrand]: true;
}

export function isValidRuleIdentity(
  ruleId: unknown,
  version: unknown,
): boolean {
  return (
    typeof ruleId === "string" &&
    ruleIdentifierPattern.test(ruleId) &&
    typeof version === "number" &&
    Number.isSafeInteger(version) &&
    version > 0
  );
}

function immutableMetadata(
  metadata: RuleMetadata | undefined,
): RuleMetadata | undefined {
  if (metadata === undefined) {
    return undefined;
  }

  const entries = Object.entries(metadata);
  if (entries.length > 25) {
    throw new RuleDefinitionInvalidError();
  }

  for (const [key, value] of entries) {
    if (
      !metadataKeyPattern.test(key) ||
      (typeof value === "string" && value.length > 500) ||
      (typeof value === "number" && !Number.isFinite(value)) ||
      (value !== null &&
        typeof value !== "string" &&
        typeof value !== "number" &&
        typeof value !== "boolean")
    ) {
      throw new RuleDefinitionInvalidError();
    }
  }

  return Object.freeze(Object.fromEntries(entries));
}

export function createRuleDefinition<
  Input,
  Context,
  Result extends RuleResultValue,
>(
  input: RuleDefinitionInput<Input, Context, Result>,
): RuleDefinition<Input, Context, Result> {
  if (
    !input ||
    !isValidRuleIdentity(input.ruleId, input.version) ||
    typeof input.enabled !== "boolean" ||
    typeof input.evaluator !== "function"
  ) {
    throw new RuleDefinitionInvalidError();
  }

  const metadata = immutableMetadata(input.metadata);
  return Object.freeze({
    ruleId: input.ruleId,
    version: input.version,
    enabled: input.enabled,
    ...(metadata ? { metadata } : {}),
    evaluator: input.evaluator,
    [ruleDefinitionBrand]: true as const,
  });
}

export function isRuleDefinition(value: unknown): value is RuleDefinition {
  return (
    typeof value === "object" &&
    value !== null &&
    ruleDefinitionBrand in value &&
    value[ruleDefinitionBrand] === true
  );
}
