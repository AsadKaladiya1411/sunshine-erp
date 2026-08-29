import { describe, expect, it } from "@jest/globals";
import {
  createRuleDefinition,
  isRuleDefinition,
  type RuleDefinitionInput,
  type RuleEvaluator,
} from "./rule.definition.js";
import { RuleDefinitionInvalidError } from "./rule.errors.js";

type FoundationInput = { readonly value: number };
type FoundationContext = { readonly expected: number };

const evaluator: RuleEvaluator<FoundationInput, FoundationContext, string> = (
  input,
  context,
) => ({
  matched: input.value === context.expected,
  result: input.value === context.expected ? "matched" : "not-matched",
});

describe("business rule definitions", () => {
  it("creates a valid typed, versioned rule definition", () => {
    const definition = createRuleDefinition({
      ruleId: "foundation.match",
      version: 1,
      enabled: true,
      metadata: { owner: "foundation", traceable: true },
      evaluator,
    });

    expect(definition).toMatchObject({
      ruleId: "foundation.match",
      version: 1,
      enabled: true,
      metadata: { owner: "foundation", traceable: true },
    });
    expect(isRuleDefinition(definition)).toBe(true);
  });

  it.each([
    { ruleId: "", version: 1, enabled: true, evaluator },
    { ruleId: "invalid rule", version: 1, enabled: true, evaluator },
    { ruleId: "foundation.match", version: 0, enabled: true, evaluator },
    { ruleId: "foundation.match", version: 1.5, enabled: true, evaluator },
  ])("rejects invalid rule definition %#", (input) => {
    expect(() => createRuleDefinition(input)).toThrow(
      RuleDefinitionInvalidError,
    );
  });

  it("rejects executable expression text instead of interpreting it", () => {
    const unsafeInput = {
      ruleId: "foundation.unsafe",
      version: 1,
      enabled: true,
      evaluator: "input.value === context.expected",
    } as unknown as RuleDefinitionInput<
      FoundationInput,
      FoundationContext,
      string
    >;

    expect(() => createRuleDefinition(unsafeInput)).toThrow(
      RuleDefinitionInvalidError,
    );
  });

  it("rejects unsafe metadata values", () => {
    const input = {
      ruleId: "foundation.metadata",
      version: 1,
      enabled: true,
      metadata: { nested: { secret: "value" } },
      evaluator,
    } as unknown as RuleDefinitionInput<
      FoundationInput,
      FoundationContext,
      string
    >;

    expect(() => createRuleDefinition(input)).toThrow(
      RuleDefinitionInvalidError,
    );
  });

  it("copies metadata and freezes the definition after creation", () => {
    const metadata: Record<string, string | number | boolean | null> = {
      owner: "foundation",
    };
    const definition = createRuleDefinition({
      ruleId: "foundation.immutable",
      version: 1,
      enabled: true,
      metadata,
      evaluator,
    });

    metadata.owner = "changed";

    expect(definition.metadata).toEqual({ owner: "foundation" });
    expect(Object.isFrozen(definition)).toBe(true);
    expect(Object.isFrozen(definition.metadata)).toBe(true);
    expect(() => {
      (definition as { enabled: boolean }).enabled = false;
    }).toThrow(TypeError);
  });
});
