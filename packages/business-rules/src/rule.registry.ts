import {
  isRuleDefinition,
  isValidRuleIdentity,
  type RuleDefinition,
  type RuleResultValue,
} from "./rule.definition.js";
import {
  DuplicateRuleError,
  RuleDefinitionInvalidError,
  RuleNotFoundError,
} from "./rule.errors.js";

type RegisteredRule = RuleDefinition<unknown, unknown, RuleResultValue>;

function registrationKey(ruleId: string, version: number): string {
  return JSON.stringify([ruleId, version]);
}

export class BusinessRuleRegistry {
  private readonly definitions = new Map<string, RegisteredRule>();

  register<Input, Context, Result extends RuleResultValue>(
    definition: RuleDefinition<Input, Context, Result>,
  ): void {
    if (!isRuleDefinition(definition)) {
      throw new RuleDefinitionInvalidError();
    }

    const key = registrationKey(definition.ruleId, definition.version);
    if (this.definitions.has(key)) {
      throw new DuplicateRuleError();
    }

    this.definitions.set(key, definition as unknown as RegisteredRule);
  }

  has(ruleId: string, version: number): boolean {
    if (!isValidRuleIdentity(ruleId, version)) {
      return false;
    }
    return this.definitions.has(registrationKey(ruleId, version));
  }

  get<Input, Context, Result extends RuleResultValue = RuleResultValue>(
    ruleId: string,
    version: number,
  ): RuleDefinition<Input, Context, Result> {
    if (!isValidRuleIdentity(ruleId, version)) {
      throw new RuleNotFoundError();
    }

    const definition = this.definitions.get(registrationKey(ruleId, version));
    if (!definition) {
      throw new RuleNotFoundError();
    }

    return definition as unknown as RuleDefinition<Input, Context, Result>;
  }
}
