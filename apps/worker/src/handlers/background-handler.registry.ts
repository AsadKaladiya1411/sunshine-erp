import type { WorkerLifecycleComponent } from "../runtime/worker-lifecycle.js";
import {
  WorkerAlreadyStartedError,
  WorkerHandlerDuplicateError,
  WorkerNotRunningError,
} from "../runtime/worker.errors.js";

export interface BackgroundHandler<TInput> {
  execute(input: TInput): Promise<void>;
}

export interface RegisteredBackgroundHandler<TInput> {
  readonly name: string;
  execute(input: TInput): Promise<void>;
}

type HandlerExecutor = (input: unknown) => Promise<void>;

export class BackgroundHandlerRegistry implements WorkerLifecycleComponent {
  readonly name = "background-handler-registry";

  private acceptingWork = false;
  private readonly handlers = new Map<string, HandlerExecutor>();
  private readonly inFlight = new Set<Promise<void>>();

  register<TInput>(
    name: string,
    handler: BackgroundHandler<TInput>,
  ): RegisteredBackgroundHandler<TInput> {
    if (this.acceptingWork) {
      throw new WorkerAlreadyStartedError();
    }
    if (this.handlers.has(name)) {
      throw new WorkerHandlerDuplicateError();
    }

    this.handlers.set(name, (input) => handler.execute(input as TInput));

    return Object.freeze({
      name,
      execute: (input: TInput) => this.execute(name, input),
    });
  }

  async start(): Promise<void> {
    this.acceptingWork = true;
  }

  async stop(): Promise<void> {
    this.acceptingWork = false;
    await Promise.allSettled([...this.inFlight]);
  }

  private async execute<TInput>(name: string, input: TInput): Promise<void> {
    if (!this.acceptingWork) {
      throw new WorkerNotRunningError();
    }

    const handler = this.handlers.get(name);
    if (!handler) {
      throw new WorkerNotRunningError();
    }

    const execution = handler(input);
    this.inFlight.add(execution);
    try {
      await execution;
    } finally {
      this.inFlight.delete(execution);
    }
  }
}
