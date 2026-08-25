import { once } from "node:events";
import { readFileSync } from "node:fs";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { Writable } from "node:stream";
import { env } from "@sunshine-erp/config";
import { afterAll, beforeAll, describe, expect, it, jest } from "@jest/globals";
import express, { type Express } from "express";
import app from "../../app.js";
import { prisma } from "../database/prisma.js";
import { errorHandler } from "../errors/error-handler.js";
import { runWithRequestContext } from "../http/request-context.js";
import { createLogger } from "../logging/logger.js";
import { createApiRateLimitMiddleware } from "./api-rate-limit.middleware.js";
import { correlationIdMiddleware } from "./correlation-id.middleware.js";

interface TestServer {
  readonly server: Server;
  readonly baseUrl: string;
}

async function startServer(application: Express): Promise<TestServer> {
  const server = application.listen(0, "127.0.0.1");
  await once(server, "listening");

  const address = server.address() as AddressInfo;

  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`,
  };
}

function stopServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

const databaseQuerySpy = jest
  .spyOn(prisma, "$queryRaw")
  .mockResolvedValue([] as never);
const appSource = readFileSync(
  new URL("../../app.ts", import.meta.url),
  "utf8",
);
const apiV1RouterSource = readFileSync(
  new URL("../../routes/api-v1.ts", import.meta.url),
  "utf8",
);

let apiServer: TestServer;
let limitedServer: TestServer;

beforeAll(async () => {
  const limitedApp = express();

  limitedApp.use(correlationIdMiddleware);
  limitedApp.use(
    "/api/v1",
    createApiRateLimitMiddleware({
      windowMs: 60_000,
      limit: 2,
    }),
  );
  limitedApp.get("/api/v1/probe", (_request, response) => {
    response.json({ status: "ok" });
  });
  limitedApp.use(errorHandler);

  [apiServer, limitedServer] = await Promise.all([
    startServer(app),
    startServer(limitedApp),
  ]);
});

afterAll(async () => {
  databaseQuerySpy.mockRestore();
  await Promise.all([
    stopServer(apiServer.server),
    stopServer(limitedServer.server),
  ]);
});

describe("HTTP security middleware foundation", () => {
  it("registers one authoritative API mount, correlation middleware, and JSON parser", () => {
    expect(
      appSource.match(/app\.use\(correlationIdMiddleware\)/g) ?? [],
    ).toHaveLength(1);
    expect(apiV1RouterSource).not.toContain("correlationIdMiddleware");
    expect(appSource.match(/express\.json\(/g) ?? []).toHaveLength(1);
    expect(appSource.match(/app\.use\("\/api\/v1"/g) ?? []).toHaveLength(1);
    expect(appSource).toContain(
      'app.use("/api/v1", apiRateLimitMiddleware, apiV1Router)',
    );
  });

  it("applies security headers without exposing Express", async () => {
    const response = await fetch(`${apiServer.baseUrl}/health`);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-security-policy")).toBeTruthy();
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("x-frame-options")).toBe("SAMEORIGIN");
    expect(response.headers.get("x-powered-by")).toBeNull();
  });

  it("generates or propagates one authoritative correlation ID", async () => {
    const generatedResponse = await fetch(`${apiServer.baseUrl}/health`);
    const propagatedResponse = await fetch(`${apiServer.baseUrl}/health`, {
      headers: {
        "X-Correlation-ID": "client-correlation-id",
      },
    });

    expect(generatedResponse.headers.get("x-correlation-id")).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(propagatedResponse.headers.get("x-correlation-id")).toBe(
      "client-correlation-id",
    );
  });

  it("allows a configured browser origin with explicit credentials", async () => {
    const response = await fetch(`${apiServer.baseUrl}/health`, {
      headers: {
        Origin: "http://localhost:3000",
      },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe(
      "http://localhost:3000",
    );
    expect(response.headers.get("access-control-allow-credentials")).toBe(
      "true",
    );
  });

  it("rejects a browser origin outside the configured allowlist", async () => {
    const response = await fetch(`${apiServer.baseUrl}/health`, {
      headers: {
        Origin: "https://unauthorized.example",
      },
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: {
        code: "CORS_ORIGIN_DENIED",
        message: "Request origin is not allowed.",
      },
    });
  });

  it("returns a predictable response when the API rate limit is exceeded", async () => {
    const responses = await Promise.all([
      fetch(`${limitedServer.baseUrl}/api/v1/probe`),
      fetch(`${limitedServer.baseUrl}/api/v1/probe`),
    ]);
    const limitedResponse = await fetch(
      `${limitedServer.baseUrl}/api/v1/probe`,
    );

    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    expect(limitedResponse.status).toBe(429);
    expect(limitedResponse.headers.get("ratelimit")).toBeTruthy();
    expect(limitedResponse.headers.get("retry-after")).toBeTruthy();
    await expect(limitedResponse.json()).resolves.toEqual({
      success: false,
      error: {
        code: "RATE_LIMIT_EXCEEDED",
        message: "Too many requests. Please try again later.",
      },
    });
  });

  it("rejects an oversized JSON body before routing", async () => {
    const response = await fetch(`${apiServer.baseUrl}/api/v1/nonexistent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        payload: "x".repeat(env.REQUEST_BODY_LIMIT_BYTES + 1),
      }),
    });

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: {
        code: "PAYLOAD_TOO_LARGE",
        message: "Request payload is too large.",
      },
    });
  });

  it("redacts authorization and credential-bearing structured log fields", async () => {
    let output = "";
    const destination = new Writable({
      write(chunk, _encoding, callback) {
        output += chunk.toString();
        callback();
      },
    });
    const secureLogger = createLogger(destination);

    runWithRequestContext({ correlationId: "security-log-test" }, () => {
      secureLogger.fatal(
        {
          req: {
            headers: {
              Authorization: "Bearer authorization-secret",
              cookie: "session=cookie-secret",
            },
            body: {
              password: "password-secret",
              refreshToken: "refresh-token-secret",
              sessionToken: "session-token-secret",
            },
          },
          STORAGE_ACCESS_KEY: "storage-access-key-secret",
        },
        "Security redaction test",
      );
    });

    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(output).toContain('"correlationId":"security-log-test"');
    expect(output).toContain("[REDACTED]");
    expect(output).not.toContain("authorization-secret");
    expect(output).not.toContain("cookie-secret");
    expect(output).not.toContain("password-secret");
    expect(output).not.toContain("refresh-token-secret");
    expect(output).not.toContain("session-token-secret");
    expect(output).not.toContain("storage-access-key-secret");
  });

  it("keeps both health endpoints operational", async () => {
    const [healthResponse, databaseHealthResponse] = await Promise.all([
      fetch(`${apiServer.baseUrl}/health`),
      fetch(`${apiServer.baseUrl}/health/db`),
    ]);

    expect(healthResponse.status).toBe(200);
    expect(healthResponse.headers.get("content-security-policy")).toBeTruthy();
    expect(healthResponse.headers.get("x-content-type-options")).toBe(
      "nosniff",
    );
    await expect(healthResponse.json()).resolves.toEqual({ status: "ok" });
    expect(databaseHealthResponse.status).toBe(200);
    expect(
      databaseHealthResponse.headers.get("content-security-policy"),
    ).toBeTruthy();
    expect(databaseHealthResponse.headers.get("x-content-type-options")).toBe(
      "nosniff",
    );
    await expect(databaseHealthResponse.json()).resolves.toEqual({
      status: "ok",
      database: "connected",
    });
  });

  it("preserves the centralized API 404 contract", async () => {
    const response = await fetch(`${apiServer.baseUrl}/api/v1/nonexistent`);

    expect(response.status).toBe(404);
    expect(response.headers.get("ratelimit")).toBeTruthy();
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: {
        code: "NOT_FOUND",
        message: "API route not found",
      },
    });
  });

  it("keeps Swagger UI accessible", async () => {
    const response = await fetch(`${apiServer.baseUrl}/docs`);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    await expect(response.text()).resolves.toContain('id="swagger-ui"');
  });
});
