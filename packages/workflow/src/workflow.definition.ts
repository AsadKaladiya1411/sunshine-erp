import { WorkflowDefinitionInvalidError } from "./workflow.errors.js";

const workflowDefinitionBrand: unique symbol = Symbol("workflow-definition");
const workflowIdentifierPattern = /^[A-Za-z][A-Za-z0-9._-]{0,99}$/;

export interface WorkflowTransitionDefinition<State extends string = string> {
  readonly from: State;
  readonly to: State;
}

export interface WorkflowDefinitionInput<State extends string = string> {
  readonly workflowKey: string;
  readonly states: readonly State[];
  readonly transitions: readonly WorkflowTransitionDefinition<State>[];
}

export interface WorkflowDefinition<State extends string = string> {
  readonly workflowKey: string;
  readonly states: readonly State[];
  readonly transitions: readonly Readonly<
    WorkflowTransitionDefinition<State>
  >[];
  readonly [workflowDefinitionBrand]: true;
}

function validIdentifier(value: unknown): value is string {
  return typeof value === "string" && workflowIdentifierPattern.test(value);
}

export function createWorkflowDefinition<const State extends string>(
  input: WorkflowDefinitionInput<State>,
): WorkflowDefinition<State> {
  if (
    !input ||
    !validIdentifier(input.workflowKey) ||
    !Array.isArray(input.states) ||
    input.states.length === 0 ||
    !Array.isArray(input.transitions)
  ) {
    throw new WorkflowDefinitionInvalidError();
  }

  const states = new Set<string>();
  for (const state of input.states) {
    if (!validIdentifier(state) || states.has(state)) {
      throw new WorkflowDefinitionInvalidError();
    }
    states.add(state);
  }

  const transitionKeys = new Set<string>();
  const transitions = input.transitions.map((transition) => {
    if (
      !transition ||
      !validIdentifier(transition.from) ||
      !validIdentifier(transition.to) ||
      !states.has(transition.from) ||
      !states.has(transition.to)
    ) {
      throw new WorkflowDefinitionInvalidError();
    }

    const transitionKey = JSON.stringify([transition.from, transition.to]);
    if (transitionKeys.has(transitionKey)) {
      throw new WorkflowDefinitionInvalidError();
    }
    transitionKeys.add(transitionKey);

    return Object.freeze({ from: transition.from, to: transition.to });
  });

  return Object.freeze({
    workflowKey: input.workflowKey,
    states: Object.freeze([...input.states]),
    transitions: Object.freeze(transitions),
    [workflowDefinitionBrand]: true as const,
  });
}

export function isWorkflowDefinition(
  value: unknown,
): value is WorkflowDefinition {
  return (
    typeof value === "object" &&
    value !== null &&
    workflowDefinitionBrand in value &&
    value[workflowDefinitionBrand] === true
  );
}
