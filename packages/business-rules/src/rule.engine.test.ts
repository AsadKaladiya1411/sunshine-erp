import { describe, expect, it } from "@jest/globals";
import {
  createRuleDefinition,
  type RuleEvaluator,
  type RuleResultValue,
} from "./rule.definition.js";
import { BusinessRulesEngine } from "./rule.engine.js";
import { RuleDisabledError, RuleEvaluationFailedError } from "./rule.errors.js";

type FoundationInput = { readonly value: number };
type FoundationContext = { readonly expected: number };
type FoundationResult = {
  readonly difference: number;
  readonly classification: string;
};

function foundationDefinition(enabled = true) {
  return createRuleDefinition<
    FoundationInput,
    FoundationContext,
    FoundationResult
  >({
    ruleId: "foundation.evaluate",
    version: 3,
    enabled,
    metadata: { source: "foundation-test" },
    evaluator: (input, context) => ({
      matched: input.value === context.expected,
      result: {
        difference: input.value - context.expected,
        classification:
          input.value === context.expected ? "matched" : "not-matched",
      },
    }),
  });
}

describe("business rule evaluation", () => {
  it("returns a matching typed result with rule traceability", () => {
    const result = new BusinessRulesEngine().evaluate(
      foundationDefinition(),
      { value: 7 },
      { expected: 7 },
    );

    expect(result).toEqual({
      ruleId: "foundation.evaluate",
      version: 3,
      matched: true,
      result: { difference: 0, classification: "matched" },
      metadata: { source: "foundation-test" },
    });
  });

  it("returns a non-matching result without treating it as failure", () => {
    const result = new BusinessRulesEngine().evaluate(
      foundationDefinition(),
      { value: 8 },
      { expected: 7 },
    );

    expect(result.matched).toBe(false);
    expect(result.result).toEqual({
      difference: 1,
      classification: "not-matched",
    });
  });

  it("produces deterministic output for the same explicit input and context", () => {
    const engine = new BusinessRulesEngine();
    const definition = foundationDefinition();
    const input = { value: 5 };
    const context = { expected: 5 };

    const first = engine.evaluate(definition, input, context);
    const second = engine.evaluate(definition, input, context);

    expect(first).toEqual(second);
    expect(input).toEqual({ value: 5 });
    expect(context).toEqual({ expected: 5 });
  });

  it("rejects disabled rules before evaluation", () => {
    let evaluationCount = 0;
    const definition = createRuleDefinition({
      ruleId: "foundation.disabled",
      version: 1,
      enabled: false,
      evaluator: () => {
        evaluationCount += 1;
        return { matched: true, result: null };
      },
    });

    expect(() =>
      new BusinessRulesEngine().evaluate(definition, {}, {}),
    ).toThrow(RuleDisabledError);
    expect(evaluationCount).toBe(0);
  });

  it("converts evaluator exceptions into a typed safe failure", () => {
    const definition = createRuleDefinition({
      ruleId: "foundation.failure",
      version: 1,
      enabled: true,
      evaluator: () => {
        throw new Error("sensitive internal evaluator detail");
      },
    });

    let captured: unknown;
    try {
      new BusinessRulesEngine().evaluate(definition, {}, {});
    } catch (error) {
      captured = error;
    }

    expect(captured).toBeInstanceOf(RuleEvaluationFailedError);
    expect((captured as Error).message).toBe(
      "Business rule evaluation failed.",
    );
    expect((captured as Error).message).not.toContain("sensitive");
  });

  it("rejects malformed evaluator output as failure, never success", () => {
    const invalidEvaluator = (() => ({
      matched: "yes",
      result: null,
    })) as unknown as RuleEvaluator<unknown, unknown, RuleResultValue>;
    const definition = createRuleDefinition({
      ruleId: "foundation.invalid-result",
      version: 1,
      enabled: true,
      evaluator: invalidEvaluator,
    });

    expect(() =>
      new BusinessRulesEngine().evaluate(definition, {}, {}),
    ).toThrow(RuleEvaluationFailedError);
  });

  it("copies and deeply freezes the evaluation result", () => {
    const externalResult = {
      details: ["first", "second"],
    };
    const definition = createRuleDefinition({
      ruleId: "foundation.result-immutability",
      version: 1,
      enabled: true,
      evaluator: () => ({ matched: true, result: externalResult }),
    });

    const result = new BusinessRulesEngine().evaluate(definition, {}, {});
    externalResult.details.push("changed");

    expect(result.result).toEqual({ details: ["first", "second"] });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.result)).toBe(true);
    expect(Object.isFrozen(result.result.details)).toBe(true);
  });
});
