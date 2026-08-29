import { describe, expect, it } from "@jest/globals";
import { createWorkflowDefinition } from "./workflow.definition.js";
import {
  WorkflowEngine,
  type WorkflowTransitionContextValue,
} from "./workflow.engine.js";
import {
  WorkflowStateUnknownError,
  WorkflowTransitionInvalidError,
} from "./workflow.errors.js";

function foundationEngine(): WorkflowEngine {
  return new WorkflowEngine(
    createWorkflowDefinition({
      workflowKey: "foundation.flow",
      states: ["state-a", "state-b", "state-c"],
      transitions: [
        { from: "state-a", to: "state-b" },
        { from: "state-b", to: "state-c" },
      ],
    }),
  );
}

describe("workflow transition engine", () => {
  it("accepts only an explicitly defined transition", () => {
    const engine = foundationEngine();

    expect(engine.isTransitionAllowed("state-a", "state-b")).toBe(true);
    expect(
      engine.validateTransition({
        currentState: "state-a",
        targetState: "state-b",
      }),
    ).toEqual({
      allowed: true,
      workflowKey: "foundation.flow",
      currentState: "state-a",
      targetState: "state-b",
    });
  });

  it("rejects an undefined transition and arbitrary state jump", () => {
    const engine = foundationEngine();

    expect(engine.isTransitionAllowed("state-a", "state-c")).toBe(false);
    expect(() =>
      engine.validateTransition({
        currentState: "state-a",
        targetState: "state-c",
      }),
    ).toThrow(WorkflowTransitionInvalidError);
  });

  it.each([
    ["unknown", "state-b"],
    ["state-a", "unknown"],
  ])("rejects unknown current or target state", (currentState, targetState) => {
    const engine = foundationEngine();

    expect(() => engine.isTransitionAllowed(currentState, targetState)).toThrow(
      WorkflowStateUnknownError,
    );
  });

  it("returns deterministic results without mutating external business state", () => {
    const engine = foundationEngine();
    const externalRecord = { state: "state-a", revision: 7 };

    const first = engine.validateTransition({
      currentState: externalRecord.state,
      targetState: "state-b",
    });
    const second = engine.validateTransition({
      currentState: externalRecord.state,
      targetState: "state-b",
    });

    expect(first).toEqual(second);
    expect(externalRecord).toEqual({ state: "state-a", revision: 7 });
  });

  it("supports multiple independent reusable definitions", () => {
    const first = foundationEngine();
    const second = new WorkflowEngine(
      createWorkflowDefinition({
        workflowKey: "secondary.flow",
        states: ["phase-one", "phase-two"],
        transitions: [{ from: "phase-one", to: "phase-two" }],
      }),
    );

    expect(first.isTransitionAllowed("state-a", "state-b")).toBe(true);
    expect(second.isTransitionAllowed("phase-one", "phase-two")).toBe(true);
    expect(first.definition.workflowKey).not.toBe(
      second.definition.workflowKey,
    );
  });

  it("copies and freezes narrow transition context without evaluating it", () => {
    const engine = foundationEngine();
    const externalContext: Record<string, WorkflowTransitionContextValue> = {
      correlationId: "correlation-1",
      organizationReference: "organization-1",
      attempt: 1,
    };

    const decision = engine.validateTransition({
      currentState: "state-a",
      targetState: "state-b",
      context: externalContext,
    });
    externalContext.attempt = 2;

    expect(decision.context).toEqual({
      correlationId: "correlation-1",
      organizationReference: "organization-1",
      attempt: 1,
    });
    expect(Object.isFrozen(decision)).toBe(true);
    expect(Object.isFrozen(decision.context)).toBe(true);
  });

  it("rejects malformed transition context with a typed error", () => {
    const engine = foundationEngine();

    expect(() =>
      engine.validateTransition({
        currentState: "state-a",
        targetState: "state-b",
        context: { invalidNumber: Number.NaN },
      }),
    ).toThrow(WorkflowTransitionInvalidError);
  });
});
