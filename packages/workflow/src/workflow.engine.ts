import {
  isWorkflowDefinition,
  type WorkflowDefinition,
} from "./workflow.definition.js";
import {
  WorkflowDefinitionInvalidError,
  WorkflowStateUnknownError,
  WorkflowTransitionInvalidError,
} from "./workflow.errors.js";

export type WorkflowTransitionContextValue = string | number | boolean | null;

export type WorkflowTransitionContext = Readonly<
  Record<string, WorkflowTransitionContextValue>
>;

export interface WorkflowTransitionRequest {
  readonly currentState: string;
  readonly targetState: string;
  readonly context?: WorkflowTransitionContext;
}

export interface WorkflowTransitionDecision {
  readonly allowed: true;
  readonly workflowKey: string;
  readonly currentState: string;
  readonly targetState: string;
  readonly context?: WorkflowTransitionContext;
}

const contextKeyPattern = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;

function immutableContext(
  context: WorkflowTransitionContext | undefined,
): WorkflowTransitionContext | undefined {
  if (context === undefined) {
    return undefined;
  }

  const entries = Object.entries(context);
  if (entries.length > 50) {
    throw new WorkflowTransitionInvalidError();
  }

  for (const [key, value] of entries) {
    if (
      !contextKeyPattern.test(key) ||
      (typeof value === "string" && value.length > 1_000) ||
      (typeof value === "number" && !Number.isFinite(value)) ||
      (value !== null &&
        typeof value !== "string" &&
        typeof value !== "number" &&
        typeof value !== "boolean")
    ) {
      throw new WorkflowTransitionInvalidError();
    }
  }

  return Object.freeze(Object.fromEntries(entries));
}

export class WorkflowEngine {
  private readonly states: ReadonlySet<string>;
  private readonly allowedTargets: ReadonlyMap<string, ReadonlySet<string>>;

  constructor(public readonly definition: WorkflowDefinition) {
    if (!isWorkflowDefinition(definition)) {
      throw new WorkflowDefinitionInvalidError();
    }

    this.states = new Set(definition.states);
    const targets = new Map<string, Set<string>>();
    for (const transition of definition.transitions) {
      const stateTargets = targets.get(transition.from) ?? new Set<string>();
      stateTargets.add(transition.to);
      targets.set(transition.from, stateTargets);
    }
    this.allowedTargets = targets;
  }

  isTransitionAllowed(currentState: string, targetState: string): boolean {
    this.assertKnownState(currentState);
    this.assertKnownState(targetState);
    return this.allowedTargets.get(currentState)?.has(targetState) ?? false;
  }

  validateTransition(
    request: WorkflowTransitionRequest,
  ): WorkflowTransitionDecision {
    if (!this.isTransitionAllowed(request.currentState, request.targetState)) {
      throw new WorkflowTransitionInvalidError();
    }

    const context = immutableContext(request.context);
    return Object.freeze({
      allowed: true as const,
      workflowKey: this.definition.workflowKey,
      currentState: request.currentState,
      targetState: request.targetState,
      ...(context ? { context } : {}),
    });
  }

  private assertKnownState(state: string): void {
    if (!this.states.has(state)) {
      throw new WorkflowStateUnknownError();
    }
  }
}
