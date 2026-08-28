import type { WorkerLogger } from "../logging/worker-logger.js";

export interface WorkerShutdownBoundary {
  shutdown(reason: string): Promise<void>;
}

export interface WorkerSignalSource {
  once(signal: NodeJS.Signals, listener: () => void): unknown;
  off(signal: NodeJS.Signals, listener: () => void): unknown;
}

export interface WorkerSignalOptions {
  readonly signalSource?: WorkerSignalSource;
  readonly onShutdownFailure?: () => void;
}

export function installWorkerSignalHandlers(
  worker: WorkerShutdownBoundary,
  logger: WorkerLogger,
  options: WorkerSignalOptions = {},
): () => void {
  const signalSource = options.signalSource ?? process;
  const onShutdownFailure =
    options.onShutdownFailure ??
    (() => {
      process.exitCode = 1;
    });
  let disposed = false;

  const dispose = (): void => {
    if (disposed) {
      return;
    }
    disposed = true;
    signalSource.off("SIGINT", onSigint);
    signalSource.off("SIGTERM", onSigterm);
  };

  const handle = (signal: NodeJS.Signals): void => {
    dispose();
    void worker.shutdown(signal).catch(() => {
      logger.error(
        { component: "worker", signal },
        "Worker signal shutdown failed",
      );
      onShutdownFailure();
    });
  };

  const onSigint = (): void => handle("SIGINT");
  const onSigterm = (): void => handle("SIGTERM");

  signalSource.once("SIGINT", onSigint);
  signalSource.once("SIGTERM", onSigterm);

  return dispose;
}
