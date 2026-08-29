import { describe, expect, it } from "@jest/globals";
import { createWorkflowDefinition } from "./workflow.definition.js";
import { WorkflowDefinitionInvalidError } from "./workflow.errors.js";

describe("workflow definitions", () => {
  it("creates an explicit valid workflow definition", () => {
    const definition = createWorkflowDefinition({
      workflowKey: "foundation.flow",
      states: ["state-a", "state-b", "state-c"],
      transitions: [
        { from: "state-a", to: "state-b" },
        { from: "state-b", to: "state-c" },
      ],
    });

    expect(definition).toMatchObject({
      workflowKey: "foundation.flow",
      states: ["state-a", "state-b", "state-c"],
      transitions: [
        { from: "state-a", to: "state-b" },
        { from: "state-b", to: "state-c" },
      ],
    });
  });

  it.each([
    {
      workflowKey: "",
      states: ["state-a"],
      transitions: [],
    },
    {
      workflowKey: "foundation.flow",
      states: [],
      transitions: [],
    },
    {
      workflowKey: "foundation.flow",
      states: ["invalid state"],
      transitions: [],
    },
    {
      workflowKey: "foundation.flow",
      states: ["state-a"],
      transitions: [{ from: "state-a", to: "state-b" }],
    },
  ])("rejects malformed workflow definition %#", (input) => {
    expect(() => createWorkflowDefinition(input)).toThrow(
      WorkflowDefinitionInvalidError,
    );
  });

  it("rejects duplicate states and duplicate transitions", () => {
    expect(() =>
      createWorkflowDefinition({
        workflowKey: "duplicate.states",
        states: ["state-a", "state-a"],
        transitions: [],
      }),
    ).toThrow(WorkflowDefinitionInvalidError);

    expect(() =>
      createWorkflowDefinition({
        workflowKey: "duplicate.transitions",
        states: ["state-a", "state-b"],
        transitions: [
          { from: "state-a", to: "state-b" },
          { from: "state-a", to: "state-b" },
        ],
      }),
    ).toThrow(WorkflowDefinitionInvalidError);
  });

  it("copies and deeply freezes the reusable definition", () => {
    const externalStates = ["state-a", "state-b"];
    const externalTransitions = [{ from: "state-a", to: "state-b" }];
    const definition = createWorkflowDefinition({
      workflowKey: "immutable.flow",
      states: externalStates,
      transitions: externalTransitions,
    });

    externalStates.push("state-c");
    externalTransitions[0]!.to = "state-c";

    expect(definition.states).toEqual(["state-a", "state-b"]);
    expect(definition.transitions).toEqual([
      { from: "state-a", to: "state-b" },
    ]);
    expect(Object.isFrozen(definition)).toBe(true);
    expect(Object.isFrozen(definition.states)).toBe(true);
    expect(Object.isFrozen(definition.transitions)).toBe(true);
    expect(Object.isFrozen(definition.transitions[0])).toBe(true);
    expect(() =>
      (definition.states as unknown as string[]).push("state-c"),
    ).toThrow(TypeError);
  });
});
