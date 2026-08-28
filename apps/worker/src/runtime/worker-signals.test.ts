import { describe, expect, it, jest } from "@jest/globals";
import type { WorkerLogger } from "../logging/worker-logger.js";
import {
  installWorkerSignalHandlers,
  type WorkerSignalSource,
} from "./worker-signals.js";

class RecordingSignalSource implements WorkerSignalSource {
  readonly listeners = new Map<NodeJS.Signals, () => void>();
  readonly onceCalls: NodeJS.Signals[] = [];
  readonly offCalls: NodeJS.Signals[] = [];

  once(signal: NodeJS.Signals, listener: () => void): void {
    this.onceCalls.push(signal);
    this.listeners.set(signal, listener);
  }

  off(signal: NodeJS.Signals, listener: () => void): void {
    this.offCalls.push(signal);
    if (this.listeners.get(signal) === listener) {
      this.listeners.delete(signal);
    }
  }

  emit(signal: NodeJS.Signals): void {
    this.listeners.get(signal)?.();
  }
}

function createLogger(): WorkerLogger {
  return {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    fatal: jest.fn(),
  };
}

describe("worker signals", () => {
  it("installs one handler per signal and triggers shutdown once", async () => {
    const signalSource = new RecordingSignalSource();
    const worker = { shutdown: jest.fn(async () => Promise.resolve()) };
    const dispose = installWorkerSignalHandlers(worker, createLogger(), {
      signalSource,
    });

    expect(signalSource.onceCalls).toEqual(["SIGINT", "SIGTERM"]);
    signalSource.emit("SIGTERM");
    signalSource.emit("SIGINT");
    await Promise.resolve();

    expect(worker.shutdown).toHaveBeenCalledTimes(1);
    expect(worker.shutdown).toHaveBeenCalledWith("SIGTERM");
    expect(signalSource.offCalls).toEqual(["SIGINT", "SIGTERM"]);
    dispose();
    expect(signalSource.offCalls).toHaveLength(2);
  });

  it("handles shutdown rejection without an unhandled failure", async () => {
    const signalSource = new RecordingSignalSource();
    const logger = createLogger();
    const onShutdownFailure = jest.fn();
    installWorkerSignalHandlers(
      {
        shutdown: jest.fn(async () =>
          Promise.reject(new Error("raw shutdown detail")),
        ),
      },
      logger,
      { signalSource, onShutdownFailure },
    );

    signalSource.emit("SIGINT");
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(onShutdownFailure).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(
      { component: "worker", signal: "SIGINT" },
      "Worker signal shutdown failed",
    );
  });
});
