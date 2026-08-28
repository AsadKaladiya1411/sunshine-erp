import { describe, expect, it, jest } from "@jest/globals";
import type { WorkerLogger } from "../logging/worker-logger.js";
import type {
  WorkerKafkaLifecycle,
  WorkerLifecycleComponent,
} from "./worker-lifecycle.js";
import { WorkerRuntime } from "./worker-runtime.js";
import { WorkerShutdownError, WorkerStartupError } from "./worker.errors.js";

function createLogger(): WorkerLogger {
  return {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    fatal: jest.fn(),
  };
}

function createKafka(
  overrides: Partial<WorkerKafkaLifecycle> = {},
): WorkerKafkaLifecycle {
  return {
    enabled: true,
    connect: jest.fn(async () => true),
    disconnect: jest.fn(async () => Promise.resolve()),
    ...overrides,
  };
}

function createComponent(
  name: string,
  order: string[],
  overrides: Partial<WorkerLifecycleComponent> = {},
): WorkerLifecycleComponent {
  return {
    name,
    start: jest.fn(async () => {
      order.push(`${name}:start`);
    }),
    stop: jest.fn(async () => {
      order.push(`${name}:stop`);
    }),
    ...overrides,
  };
}

describe("WorkerRuntime", () => {
  it("starts components and shuts them down in reverse order before Kafka", async () => {
    const order: string[] = [];
    const kafka = createKafka({
      connect: jest.fn(async () => {
        order.push("kafka:connect");
        return true;
      }),
      disconnect: jest.fn(async () => {
        order.push("kafka:disconnect");
      }),
    });
    const handlers = createComponent("handlers", order);
    const consumers = createComponent("consumers", order);
    const runtime = new WorkerRuntime({
      kafka,
      components: [handlers, consumers],
      logger: createLogger(),
    });

    await expect(runtime.start()).resolves.toEqual({ kafkaAvailable: true });
    await expect(runtime.shutdown("test")).resolves.toBeUndefined();
    await runtime.shutdown("duplicate");

    expect(order).toEqual([
      "kafka:connect",
      "handlers:start",
      "consumers:start",
      "consumers:stop",
      "handlers:stop",
      "kafka:disconnect",
    ]);
    expect(kafka.disconnect).toHaveBeenCalledTimes(1);
  });

  it("starts predictably when optional Kafka is unavailable", async () => {
    const kafka = createKafka({
      enabled: false,
      connect: jest.fn(async () => false),
    });
    const runtime = new WorkerRuntime({
      kafka,
      components: [],
      logger: createLogger(),
    });

    await expect(runtime.start()).resolves.toEqual({ kafkaAvailable: false });
    await expect(runtime.shutdown("test")).resolves.toBeUndefined();
  });

  it("cleans every initialized boundary when startup fails", async () => {
    const order: string[] = [];
    const kafka = createKafka({
      disconnect: jest.fn(async () => {
        order.push("kafka:disconnect");
      }),
    });
    const first = createComponent("first", order);
    const failing = createComponent("failing", order, {
      start: jest.fn(async () => {
        order.push("failing:start");
        throw new Error("raw startup detail");
      }),
    });
    const runtime = new WorkerRuntime({
      kafka,
      components: [first, failing],
      logger: createLogger(),
    });

    await expect(runtime.start()).rejects.toBeInstanceOf(WorkerStartupError);
    expect(order).toEqual([
      "first:start",
      "failing:start",
      "failing:stop",
      "first:stop",
      "kafka:disconnect",
    ]);
    await expect(runtime.shutdown("startup-failure")).resolves.toBeUndefined();
    expect(kafka.disconnect).toHaveBeenCalledTimes(1);
  });

  it("attempts all shutdown cleanup and reports a typed failure", async () => {
    const order: string[] = [];
    const kafka = createKafka({
      disconnect: jest.fn(async () => {
        order.push("kafka:disconnect");
        throw new Error("raw Kafka detail");
      }),
    });
    const first = createComponent("first", order, {
      stop: jest.fn(async () => {
        order.push("first:stop");
        throw new Error("raw handler detail");
      }),
    });
    const second = createComponent("second", order);
    const runtime = new WorkerRuntime({
      kafka,
      components: [first, second],
      logger: createLogger(),
    });
    await runtime.start();

    await expect(runtime.shutdown("test")).rejects.toBeInstanceOf(
      WorkerShutdownError,
    );
    expect(order.slice(-3)).toEqual([
      "second:stop",
      "first:stop",
      "kafka:disconnect",
    ]);
  });
});
