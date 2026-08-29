export type WorkflowErrorCode =
  | "WORKFLOW_DEFINITION_INVALID"
  | "WORKFLOW_STATE_UNKNOWN"
  | "WORKFLOW_TRANSITION_INVALID";

export class WorkflowError extends Error {
  constructor(
    public readonly code: WorkflowErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "WorkflowError";
  }
}

export class WorkflowDefinitionInvalidError extends WorkflowError {
  constructor() {
    super("WORKFLOW_DEFINITION_INVALID", "Workflow definition is invalid.");
  }
}

export class WorkflowStateUnknownError extends WorkflowError {
  constructor() {
    super("WORKFLOW_STATE_UNKNOWN", "Workflow state is unknown.");
  }
}

export class WorkflowTransitionInvalidError extends WorkflowError {
  constructor() {
    super("WORKFLOW_TRANSITION_INVALID", "Workflow transition is invalid.");
  }
}
