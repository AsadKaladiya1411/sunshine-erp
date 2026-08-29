import { describe, expect, it } from "@jest/globals";
import { createWorkflowDefinition } from "./workflow.definition.js";
import { WorkflowEngine } from "./workflow.engine.js";
import { WorkflowTransitionInvalidError } from "./workflow.errors.js";

const engine = new WorkflowEngine(
  createWorkflowDefinition({
    workflowKey: "separation.flow",
    states: ["state-a", "state-b", "state-c"],
    transitions: [{ from: "state-a", to: "state-b" }],
  }),
);

describe("workflow engine responsibility separation", () => {
  it("does not perform RBAC permission decisions", () => {
    expect(
      engine.validateTransition({
        currentState: "state-a",
        targetState: "state-b",
        context: { hasPermission: false, roleReference: "role-1" },
      }).allowed,
    ).toBe(true);
  });

  it("does not treat approval context as a transition definition", () => {
    expect(() =>
      engine.validateTransition({
        currentState: "state-a",
        targetState: "state-c",
        context: { approved: true, approvalLevel: 3 },
      }),
    ).toThrow(WorkflowTransitionInvalidError);
  });

  it("does not evaluate business-rule context", () => {
    expect(() =>
      engine.validateTransition({
        currentState: "state-a",
        targetState: "state-c",
        context: { businessRulePassed: true, threshold: 10_000 },
      }),
    ).toThrow(WorkflowTransitionInvalidError);
  });
});
