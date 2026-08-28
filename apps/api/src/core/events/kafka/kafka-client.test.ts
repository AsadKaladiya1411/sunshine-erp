import { describe, expect, it, jest } from "@jest/globals";
import {
  KafkaInfrastructureClient,
  type KafkaAdminTransport,
  type KafkaOperationalLogger,
  type KafkaTransportFactory,
} from "./kafka-client.js";
import { KafkaDisabledError } from "./kafka.errors.js";

function createAdmin(
  overrides: Partial<KafkaAdminTransport> = {},
): KafkaAdminTransport {
  return {
    connect: jest.fn(async () => undefined),
    disconnect: jest.fn(async () => undefined),
    ping: jest.fn(async () => undefined),
    ...overrides,
  };
}

function createFactory(admin: KafkaAdminTransport): KafkaTransportFactory {
  return {
    createAdmin: jest.fn(() => admin),
    createProducer: jest.fn(() => {
      throw new Error("not used");
    }),
    createConsumer: jest.fn(() => {
      throw new Error("not used");
    }),
  };
}

function createRecordingLogger(): {
  readonly logger: KafkaOperationalLogger;
  readonly records: unknown[];
} {
  const records: unknown[] = [];
  return {
    records,
    logger: {
      info(bindings, message) {
        records.push({ bindings, message });
      },
      warn(bindings, message) {
        records.push({ bindings, message });
      },
    },
  };
}

describe("Kafka infrastructure client", () => {
  it("connects, checks health, and disconnects through the private transport", async () => {
    const admin = createAdmin();
    const client = new KafkaInfrastructureClient(
      {
        enabled: true,
        brokers: ["localhost:9092"],
        clientId: "foundation-test",
      },
      createFactory(admin),
      createRecordingLogger().logger,
    );

    await expect(client.connect()).resolves.toBe(true);
    expect(client.connected).toBe(true);
    await expect(client.ping()).resolves.toBe(true);
    expect(admin.ping).toHaveBeenCalledTimes(1);
    await client.disconnect();
    expect(admin.disconnect).toHaveBeenCalledTimes(1);
    expect(client.connected).toBe(false);
  });

  it("keeps disabled Kafka optional and rejects transport creation", async () => {
    const client = new KafkaInfrastructureClient(
      { enabled: false, clientId: "foundation-test" },
      undefined,
      createRecordingLogger().logger,
    );

    expect(client.enabled).toBe(false);
    await expect(client.connect()).resolves.toBe(false);
    await expect(client.ping()).resolves.toBe(false);
    expect(() => client.createProducerTransport()).toThrow(KafkaDisabledError);
    await client.disconnect();
  });

  it("detects an unavailable broker without logging raw credential-bearing errors", async () => {
    const embeddedSecret = "kafka-password-that-must-not-be-logged";
    const admin = createAdmin({
      connect: jest.fn(async () => {
        throw Object.assign(new Error(`connection failed: ${embeddedSecret}`), {
          code: "BROKER_UNAVAILABLE",
        });
      }),
    });
    const recording = createRecordingLogger();
    const client = new KafkaInfrastructureClient(
      {
        enabled: true,
        brokers: ["localhost:9092"],
        clientId: "foundation-test",
      },
      createFactory(admin),
      recording.logger,
    );

    await expect(client.connect()).resolves.toBe(false);
    expect(client.connected).toBe(false);
    await expect(client.ping()).resolves.toBe(false);
    expect(JSON.stringify(recording.records)).not.toContain(embeddedSecret);
    expect(recording.records).toContainEqual(
      expect.objectContaining({
        bindings: {
          component: "kafka",
          errorCode: "BROKER_UNAVAILABLE",
        },
      }),
    );
  });
});
