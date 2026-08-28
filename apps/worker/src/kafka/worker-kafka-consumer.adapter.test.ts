import { describe, expect, it, jest } from "@jest/globals";
import { createKafkaTopicName } from "@sunshine-erp/messaging";
import { WorkerKafkaConsumerAdapter } from "./worker-kafka-consumer.adapter.js";

describe("WorkerKafkaConsumerAdapter", () => {
  it("delegates typed registration and lifecycle to KafkaTypedConsumer", async () => {
    const consumer = {
      register: jest.fn(),
      start: jest.fn(async () => Promise.resolve()),
      stop: jest.fn(async () => Promise.resolve()),
    };
    const adapter = new WorkerKafkaConsumerAdapter(
      "foundation-consumer",
      consumer,
    );
    const registration = {
      topic: createKafkaTopicName("sunshine.infrastructure.events"),
      decode: (value: Buffer) => value.toString(),
      handle: jest.fn(async (_message: unknown) => Promise.resolve()),
    };

    adapter.register(registration);
    await adapter.start();
    await adapter.stop();

    expect(adapter.name).toBe("kafka-consumer:foundation-consumer");
    expect(consumer.register).toHaveBeenCalledWith(registration);
    expect(consumer.start).toHaveBeenCalledTimes(1);
    expect(consumer.stop).toHaveBeenCalledTimes(1);
  });
});
