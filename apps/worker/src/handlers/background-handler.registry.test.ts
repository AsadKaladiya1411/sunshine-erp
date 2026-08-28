import { describe, expect, it, jest } from "@jest/globals";
import { BackgroundHandlerRegistry } from "./background-handler.registry.js";
import {
  WorkerAlreadyStartedError,
  WorkerHandlerDuplicateError,
  WorkerNotRunningError,
} from "../runtime/worker.errors.js";

describe("BackgroundHandlerRegistry", () => {
  it("registers and executes a typed asynchronous handler while running", async () => {
    const registry = new BackgroundHandlerRegistry();
    const execute = jest.fn(async (_input: { readonly recordId: string }) =>
      Promise.resolve(),
    );
    const handler = registry.register("foundation-handler", { execute });

    await expect(
      handler.execute({ recordId: "before-start" }),
    ).rejects.toBeInstanceOf(WorkerNotRunningError);
    await registry.start();
    await handler.execute({ recordId: "record-1" });
    expect(execute).toHaveBeenCalledWith({ recordId: "record-1" });
    expect(() => registry.register("late-handler", { execute })).toThrow(
      WorkerAlreadyStartedError,
    );
    await registry.stop();
    await expect(
      handler.execute({ recordId: "after-stop" }),
    ).rejects.toBeInstanceOf(WorkerNotRunningError);
  });

  it("rejects duplicate names and propagates handler failures", async () => {
    const registry = new BackgroundHandlerRegistry();
    const failure = new Error("handler failed");
    const handler = registry.register("unique-handler", {
      execute: jest.fn(async () => Promise.reject(failure)),
    });

    expect(() =>
      registry.register("unique-handler", {
        execute: jest.fn(async () => Promise.resolve()),
      }),
    ).toThrow(WorkerHandlerDuplicateError);
    await registry.start();
    await expect(handler.execute(undefined)).rejects.toBe(failure);
    await registry.stop();
  });

  it("stops accepting work and waits for in-flight execution", async () => {
    const registry = new BackgroundHandlerRegistry();
    let release: (() => void) | undefined;
    const executionGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const handler = registry.register("in-flight-handler", {
      execute: async () => executionGate,
    });
    await registry.start();

    const execution = handler.execute(undefined);
    const stop = registry.stop();
    await expect(handler.execute(undefined)).rejects.toBeInstanceOf(
      WorkerNotRunningError,
    );
    release?.();
    await expect(execution).resolves.toBeUndefined();
    await expect(stop).resolves.toBeUndefined();
  });
});
