import { PassThrough } from "node:stream";
import { describe, expect, it } from "@jest/globals";
import { createWorkerLogger } from "./worker-logger.js";

describe("worker logger", () => {
  it("redacts infrastructure credentials and secrets", async () => {
    const destination = new PassThrough();
    let output = "";
    destination.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    const logger = createWorkerLogger(destination);

    logger.fatal(
      {
        DATABASE_URL: "postgresql://user:database-secret@localhost/erp",
        REDIS_URL: "redis://:redis-secret@localhost:6379",
        KAFKA_BROKERS: "user:kafka-secret@localhost:9092",
        token: "token-secret",
        passwordHash: "password-hash-secret",
      },
      "redaction test",
    );
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(output).toContain("[REDACTED]");
    expect(output).not.toContain("database-secret");
    expect(output).not.toContain("redis-secret");
    expect(output).not.toContain("kafka-secret");
    expect(output).not.toContain("token-secret");
    expect(output).not.toContain("password-hash-secret");
  });
});
