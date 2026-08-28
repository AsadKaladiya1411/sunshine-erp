import type { WorkerLogger } from "../logging/worker-logger.js";
import type {
  WorkerKafkaLifecycle,
  WorkerLifecycleComponent,
  WorkerStartResult,
} from "./worker-lifecycle.js";
import {
  WorkerAlreadyStartedError,
  WorkerShutdownError,
  WorkerStartupError,
} from "./worker.errors.js";

type WorkerState =
  "idle" | "starting" | "running" | "stopping" | "stopped" | "failed";

export interface WorkerRuntimeOptions {
  readonly kafka: WorkerKafkaLifecycle;
  readonly components: readonly WorkerLifecycleComponent[];
  readonly logger: WorkerLogger;
}

export class WorkerRuntime {
  private kafkaReleased = false;
  private readonly startedComponents: WorkerLifecycleComponent[] = [];
  private startPromise: Promise<WorkerStartResult> | undefined;
  private shutdownPromise: Promise<void> | undefined;
  private state: WorkerState = "idle";

  constructor(private readonly options: WorkerRuntimeOptions) {}

  start(): Promise<WorkerStartResult> {
    if (this.startPromise) {
      return this.startPromise;
    }
    if (this.state !== "idle") {
      return Promise.reject(new WorkerAlreadyStartedError());
    }

    this.state = "starting";
    this.startPromise = this.performStart();
    return this.startPromise;
  }

  shutdown(reason: string): Promise<void> {
    this.shutdownPromise ??= this.performShutdown(reason);
    return this.shutdownPromise;
  }

  private async performStart(): Promise<WorkerStartResult> {
    try {
      const kafkaAvailable = await this.options.kafka.connect();

      for (const component of this.options.components) {
        this.startedComponents.push(component);
        await component.start();
      }

      this.state = "running";
      this.options.logger.info(
        {
          component: "worker",
          kafkaEnabled: this.options.kafka.enabled,
          kafkaAvailable,
        },
        "Worker started",
      );
      return Object.freeze({ kafkaAvailable });
    } catch {
      this.state = "failed";
      await this.stopStartedComponents();
      await this.releaseKafka();
      this.options.logger.error(
        { component: "worker", stage: "startup" },
        "Worker startup failed",
      );
      throw new WorkerStartupError();
    }
  }

  private async performShutdown(reason: string): Promise<void> {
    if (this.state === "starting" && this.startPromise) {
      await this.startPromise.catch(() => undefined);
    }
    if (this.state === "stopped") {
      return;
    }

    this.state = "stopping";
    this.options.logger.info(
      { component: "worker", reason },
      "Worker shutdown started",
    );

    const componentCleanupFailed = await this.stopStartedComponents();
    const kafkaCleanupFailed = await this.releaseKafka();
    this.state = "stopped";

    if (componentCleanupFailed || kafkaCleanupFailed) {
      this.options.logger.error(
        { component: "worker", stage: "shutdown" },
        "Worker shutdown completed with cleanup failures",
      );
      throw new WorkerShutdownError();
    }

    this.options.logger.info({ component: "worker", reason }, "Worker stopped");
  }

  private async stopStartedComponents(): Promise<boolean> {
    let cleanupFailed = false;

    while (this.startedComponents.length > 0) {
      const component = this.startedComponents.pop();
      if (!component) {
        continue;
      }
      try {
        await component.stop();
      } catch {
        cleanupFailed = true;
        this.options.logger.warn(
          { component: "worker", lifecycleComponent: component.name },
          "Worker component cleanup failed",
        );
      }
    }

    return cleanupFailed;
  }

  private async releaseKafka(): Promise<boolean> {
    if (this.kafkaReleased) {
      return false;
    }
    this.kafkaReleased = true;

    try {
      await this.options.kafka.disconnect();
      return false;
    } catch {
      this.options.logger.warn(
        { component: "worker", lifecycleComponent: "kafka" },
        "Worker Kafka cleanup failed",
      );
      return true;
    }
  }
}
