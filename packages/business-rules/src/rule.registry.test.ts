import { describe, expect, it } from "@jest/globals";
import { createRuleDefinition } from "./rule.definition.js";
import {
  DuplicateRuleError,
  RuleDefinitionInvalidError,
  RuleNotFoundError,
} from "./rule.errors.js";
import { BusinessRuleRegistry } from "./rule.registry.js";

function definition(version: number) {
  return createRuleDefinition({
    ruleId: "foundation.versioned",
    version,
    enabled: true,
    evaluator: (input: Readonly<{ value: number }>) => ({
      matched: input.value === version,
      result: version,
    }),
  });
}

describe("business rule registry", () => {
  it("registers and looks up an exact identity and version", () => {
    const registry = new BusinessRuleRegistry();
    const registered = definition(1);

    registry.register(registered);

    expect(registry.has("foundation.versioned", 1)).toBe(true);
    expect(registry.get("foundation.versioned", 1)).toBe(registered);
  });

  it("rejects duplicate rule identity and version", () => {
    const registry = new BusinessRuleRegistry();
    registry.register(definition(1));

    expect(() => registry.register(definition(1))).toThrow(DuplicateRuleError);
  });

  it("supports independent immutable versions of one rule identity", () => {
    const registry = new BusinessRuleRegistry();
    const versionOne = definition(1);
    const versionTwo = definition(2);

    registry.register(versionOne);
    registry.register(versionTwo);

    expect(registry.get("foundation.versioned", 1)).toBe(versionOne);
    expect(registry.get("foundation.versioned", 2)).toBe(versionTwo);
  });

  it("returns a typed safe not-found error", () => {
    const registry = new BusinessRuleRegistry();

    expect(() => registry.get("foundation.missing", 1)).toThrow(
      RuleNotFoundError,
    );
    expect(registry.has("invalid rule", 1)).toBe(false);
  });

  it("accepts only definitions created by the definition factory", () => {
    const registry = new BusinessRuleRegistry();
    const untrusted = {
      ruleId: "foundation.untrusted",
      version: 1,
      enabled: true,
      evaluator: () => ({ matched: true, result: null }),
    } as unknown as ReturnType<typeof definition>;

    expect(() => registry.register(untrusted)).toThrow(
      RuleDefinitionInvalidError,
    );
  });
});
