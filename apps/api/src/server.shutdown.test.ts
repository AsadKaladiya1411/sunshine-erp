import { once } from "node:events";
import { createServer, get, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { afterEach, describe, expect, it, jest } from "@jest/globals";

const redisDisconnect = jest.fn(async () => undefined);
const kafkaDisconnect = jest.fn(async () => undefined);
const storageDisconnect = jest.fn(async () => undefined);
const prismaDisconnect = jest.fn(async () => undefined);
const loggerWarn = jest.fn();

let completeCleanup: (() => void) | undefined;
const loggerInfo = jest.fn((messageOrContext: unknown) => {
  if (messageOrContext === "API shutdown completed") {
    completeCleanup?.();
  }
});

const server = createServer((_request, response) => {
  response.writeHead(200, { "content-type": "text/plain" });
  response.write("request remains active");
});

const app = {
  listen(_port: number, onListening: () => void): Server {
    return server.listen(0, "127.0.0.1", onListening);
  },
};

jest.unstable_mockModule("./app.js", () => ({ default: app }));
jest.unstable_mockModule("@sunshine-erp/config", () => ({ env: { PORT: 0 } }));
jest.unstable_mockModule("./core/cache/redis-client.js", () => ({
  redisClient: {
    connect: jest.fn(async () => true),
    disconnect: redisDisconnect,
  },
}));
jest.unstable_mockModule("./core/events/kafka/kafka-client.js", () => ({
  kafkaClient: {
    connect: jest.fn(async () => true),
    disconnect: kafkaDisconnect,
  },
}));
jest.unstable_mockModule("./core/storage/storage-client.js", () => ({
  storageClient: {
    connect: jest.fn(async () => true),
    disconnect: storageDisconnect,
  },
}));
jest.unstable_mockModule("./core/database/prisma.js", () => ({
  prisma: { $disconnect: prismaDisconnect },
}));
jest.unstable_mockModule("./core/logging/logger.js", () => ({
  logger: {
    info: loggerInfo,
    warn: loggerWarn,
    error: jest.fn(),
    fatal: jest.fn(),
  },
}));

afterEach(() => {
  completeCleanup = undefined;
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe("API graceful shutdown deadline", () => {
  it("forcibly closes an active request after ten seconds and then cleans up infrastructure", async () => {
    const existingSigintListeners = new Set(process.listeners("SIGINT"));
    const existingSigtermListeners = new Set(process.listeners("SIGTERM"));

    await import("./server.js");
    if (!server.listening) await once(server, "listening");

    const sigintListener = process
      .listeners("SIGINT")
      .find((listener) => !existingSigintListeners.has(listener));
    const sigtermListener = process
      .listeners("SIGTERM")
      .find((listener) => !existingSigtermListeners.has(listener));

    expect(sigintListener).toBeDefined();
    expect(sigtermListener).toBeDefined();

    const address = server.address() as AddressInfo;
    const responsePromise = new Promise<IncomingMessage>((resolve, reject) => {
      const request = get(`http://127.0.0.1:${address.port}/`, resolve);
      request.on("error", reject);
    });
    const response = await responsePromise;
    response.on("error", () => undefined);
    response.resume();

    let connectionClosed = false;
    const connectionClosedPromise = new Promise<void>((resolve) => {
      response.once("close", () => {
        connectionClosed = true;
        resolve();
      });
    });

    const close = jest.spyOn(server, "close");
    const closeAllConnections = jest.spyOn(server, "closeAllConnections");
    let cleanupCompleted = false;
    const cleanupCompletedPromise = new Promise<void>((resolve) => {
      completeCleanup = () => {
        cleanupCompleted = true;
        resolve();
      };
    });

    jest.useFakeTimers();
    try {
      sigtermListener?.("SIGTERM");

      expect(loggerInfo).toHaveBeenCalledWith(
        { signal: "SIGTERM" },
        "API shutdown started",
      );
      expect(close).toHaveBeenCalledTimes(1);
      expect(closeAllConnections).not.toHaveBeenCalled();
      expect(connectionClosed).toBe(false);
      expect(cleanupCompleted).toBe(false);
      expect(redisDisconnect).not.toHaveBeenCalled();

      await jest.advanceTimersByTimeAsync(9_999);
      expect(closeAllConnections).not.toHaveBeenCalled();
      expect(connectionClosed).toBe(false);
      expect(cleanupCompleted).toBe(false);

      await jest.advanceTimersByTimeAsync(1);
      expect(closeAllConnections).toHaveBeenCalledTimes(1);
      expect(loggerWarn).toHaveBeenCalledWith(
        { timeoutMs: 10_000 },
        "API shutdown deadline reached; forcing remaining connections closed",
      );

      await Promise.all([cleanupCompletedPromise, connectionClosedPromise]);
      expect(connectionClosed).toBe(true);
      expect(redisDisconnect).toHaveBeenCalledTimes(1);
      expect(kafkaDisconnect).toHaveBeenCalledTimes(1);
      expect(storageDisconnect).toHaveBeenCalledTimes(1);
      expect(prismaDisconnect).toHaveBeenCalledTimes(1);
    } finally {
      if (sigintListener) process.removeListener("SIGINT", sigintListener);
      if (sigtermListener) process.removeListener("SIGTERM", sigtermListener);
      server.closeAllConnections();
      if (server.listening) server.close();
    }
  });
});
