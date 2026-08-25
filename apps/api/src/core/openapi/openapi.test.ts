import { once } from "node:events";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import SwaggerParser from "@apidevtools/swagger-parser";
import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import app from "../../app.js";
import { openApiDocument } from "./openapi.js";

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  server = app.listen(0, "127.0.0.1");
  await once(server, "listening");

  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(
  () =>
    new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    }),
);

describe("OpenAPI foundation", () => {
  it("loads and validates the centralized OpenAPI specification", async () => {
    const validatedDocument = await SwaggerParser.validate(openApiDocument);

    if (!("openapi" in validatedDocument)) {
      throw new Error("Expected an OpenAPI 3 document.");
    }

    expect(validatedDocument.openapi).toBe("3.0.3");
    expect(validatedDocument.info.title).toBe("NO CHEAT ERP API");
  });

  it("serves Swagger UI and the JSON specification", async () => {
    const docsResponse = await fetch(`${baseUrl}/docs`);
    const specificationResponse = await fetch(`${baseUrl}/docs/openapi.json`);

    expect(docsResponse.status).toBe(200);
    expect(docsResponse.headers.get("content-type")).toContain("text/html");
    await expect(docsResponse.text()).resolves.toContain('id="swagger-ui"');

    expect(specificationResponse.status).toBe(200);
    expect(specificationResponse.headers.get("content-type")).toContain(
      "application/json",
    );
    await expect(specificationResponse.json()).resolves.toMatchObject({
      openapi: "3.0.3",
      info: {
        title: "NO CHEAT ERP API",
      },
    });
  });

  it("documents both health endpoints", () => {
    expect(openApiDocument.paths["/health"]?.get).toBeDefined();
    expect(openApiDocument.paths["/health/db"]?.get).toBeDefined();
  });

  it("documents standard and validation error schemas", () => {
    expect(
      openApiDocument.components?.schemas?.StandardErrorResponse,
    ).toBeDefined();
    expect(
      openApiDocument.components?.schemas?.ValidationErrorResponse,
    ).toBeDefined();
    expect(
      openApiDocument.components?.schemas?.ValidationErrorDetail,
    ).toBeDefined();
  });

  it("documents correlation ID request and response headers", () => {
    expect(openApiDocument.components?.parameters?.CorrelationId).toMatchObject(
      {
        name: "X-Correlation-ID",
        in: "header",
      },
    );
    expect(openApiDocument.components?.headers?.CorrelationId).toBeDefined();
  });

  it("reserves the /api/v1 namespace without fake operations", () => {
    expect(openApiDocument.paths["/api/v1"]).toEqual({
      description:
        "Version 1 API namespace. Future module operations are registered below this root.",
    });
  });
});
