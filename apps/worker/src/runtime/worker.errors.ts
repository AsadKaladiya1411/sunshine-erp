export type WorkerInfrastructureErrorCode =
  | "WORKER_NOT_RUNNING"
  | "WORKER_ALREADY_STARTED"
  | "WORKER_HANDLER_DUPLICATE"
  | "WORKER_STARTUP_FAILED"
  | "WORKER_SHUTDOWN_FAILED";

export class WorkerInfrastructureError extends Error {
  constructor(
    public readonly code: WorkerInfrastructureErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "WorkerInfrastructureError";
  }
}

export class WorkerNotRunningError extends WorkerInfrastructureError {
  constructor() {
    super("WORKER_NOT_RUNNING", "The worker is not accepting work.");
  }
}

export class WorkerAlreadyStartedError extends WorkerInfrastructureError {
  constructor() {
    super(
      "WORKER_ALREADY_STARTED",
      "Worker registrations cannot change after startup.",
    );
  }
}

export class WorkerHandlerDuplicateError extends WorkerInfrastructureError {
  constructor() {
    super(
      "WORKER_HANDLER_DUPLICATE",
      "A worker handler is already registered with this name.",
    );
  }
}

export class WorkerStartupError extends WorkerInfrastructureError {
  constructor() {
    super("WORKER_STARTUP_FAILED", "Worker startup failed.");
  }
}

export class WorkerShutdownError extends WorkerInfrastructureError {
  constructor() {
    super("WORKER_SHUTDOWN_FAILED", "Worker shutdown failed.");
  }
}
