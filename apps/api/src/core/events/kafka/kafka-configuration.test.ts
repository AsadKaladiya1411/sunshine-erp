import { describe, expect, it } from "@jest/globals";
import { parseEnvironment } from "@sunshine-erp/config";

const baseEnvironment = {
  DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/sunshine_erp",
};

describe("Kafka configuration", () => {
  it("accepts enabled Kafka with validated brokers and centralized defaults", () => {
    expect(
      parseEnvironment({
        ...baseEnvironment,
        KAFKA_ENABLED: "true",
        KAFKA_BROKERS: "localhost:9092, kafka:29092",
      }),
    ).toMatchObject({
      KAFKA_ENABLED: true,
      KAFKA_BROKERS: ["localhost:9092", "kafka:29092"],
      KAFKA_CLIENT_ID: "sunshine-erp-api",
    });
  });

  it.each([
    "http://localhost:9092",
    "user:password@localhost:9092",
    "localhost",
    "localhost:0",
    "localhost:65536",
    "localhost:9092,",
  ])("rejects invalid broker configuration: %s", (brokers) => {
    expect(() =>
      parseEnvironment({
        ...baseEnvironment,
        KAFKA_ENABLED: "true",
        KAFKA_BROKERS: brokers,
      }),
    ).toThrow();
  });

  it("requires brokers when Kafka is enabled", () => {
    expect(() =>
      parseEnvironment({
        ...baseEnvironment,
        KAFKA_ENABLED: "true",
      }),
    ).toThrow();
  });

  it("allows Kafka to be disabled without broker configuration", () => {
    expect(parseEnvironment(baseEnvironment)).toMatchObject({
      KAFKA_ENABLED: false,
      KAFKA_CLIENT_ID: "sunshine-erp-api",
    });
    expect(parseEnvironment(baseEnvironment).KAFKA_BROKERS).toBeUndefined();
  });
});
