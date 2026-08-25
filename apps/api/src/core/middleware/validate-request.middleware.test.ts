import { once } from "node:events";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import express, { type RequestHandler } from "express";
import { z } from "zod";
import { errorHandler } from "../errors/error-handler.js";
import { apiNotFoundHandler } from "./api-not-found.middleware.js";
import { correlationIdMiddleware } from "./correlation-id.middleware.js";
import {
  getValidatedRequest,
  validateRequest,
  type RequestValidationSchemas,
  type ValidatedRequestData,
} from "./validate-request.middleware.js";

const validResourceId = "00000000-0000-4000-8000-000000000000";
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const demonstrationSchemas = {
  params: z.object({
    resourceId: z.string().regex(uuidPattern, "Resource ID must be a UUID."),
  }),
  query: z.object({
    limit: z
      .string()
      .regex(/^[1-9]\d*$/, "Limit must be a positive integer.")
      .transform(Number),
  }),
  body: z.object({
    name: z.string().trim().min(1, "Name is required."),
  }),
} satisfies RequestValidationSchemas;

type DemonstrationInput = ValidatedRequestData<typeof demonstrationSchemas>;

const demonstrationService = jest.fn(
  (input: DemonstrationInput): DemonstrationInput => input,
);

const demonstrationController = jest.fn<RequestHandler>((request, response) => {
  const input = getValidatedRequest(request, demonstrationSchemas);
  const result = demonstrationService(input);

  response.json({
    success: true,
    data: result,
  });
});

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const app = express();
  const apiV1Router = express.Router();

  app.use(express.json());
  apiV1Router.use(correlationIdMiddleware);
  apiV1Router.post(
    "/validation-demo/:resourceId",
    validateRequest(demonstrationSchemas),
    demonstrationController,
  );
  apiV1Router.use(apiNotFoundHandler);
  app.use("/api/v1", apiV1Router);
  app.use(errorHandler);

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

beforeEach(() => {
  demonstrationController.mockClear();
  demonstrationService.mockClear();
});

async function postDemonstration(
  resourceId = validResourceId,
  limit = "5",
  body: unknown = { name: "Foundation" },
): Promise<Response> {
  return fetch(
    `${baseUrl}/api/v1/validation-demo/${resourceId}?limit=${limit}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );
}

describe("request validation middleware", () => {
  it("passes strongly typed validated values to the controller and service", async () => {
    const response = await postDemonstration();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: {
        params: { resourceId: validResourceId },
        query: { limit: 5 },
        body: { name: "Foundation" },
      },
    });
    expect(demonstrationController).toHaveBeenCalledTimes(1);
    expect(demonstrationService).toHaveBeenCalledTimes(1);
  });

  it("returns predictable details for an invalid body", async () => {
    const response = await postDemonstration(validResourceId, "5", {
      name: "",
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Request validation failed.",
        details: [
          {
            source: "body",
            path: ["name"],
            message: "Name is required.",
          },
        ],
      },
    });
    expect(demonstrationController).not.toHaveBeenCalled();
    expect(demonstrationService).not.toHaveBeenCalled();
  });

  it("returns predictable details for an invalid query", async () => {
    const response = await postDemonstration(validResourceId, "invalid");

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Request validation failed.",
        details: [
          {
            source: "query",
            path: ["limit"],
            message: "Limit must be a positive integer.",
          },
        ],
      },
    });
    expect(demonstrationController).not.toHaveBeenCalled();
    expect(demonstrationService).not.toHaveBeenCalled();
  });

  it("returns predictable details for invalid params", async () => {
    const response = await postDemonstration("not-a-uuid");

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Request validation failed.",
        details: [
          {
            source: "params",
            path: ["resourceId"],
            message: "Resource ID must be a UUID.",
          },
        ],
      },
    });
    expect(demonstrationController).not.toHaveBeenCalled();
    expect(demonstrationService).not.toHaveBeenCalled();
  });

  it("preserves the centralized API 404 contract", async () => {
    const response = await fetch(`${baseUrl}/api/v1/nonexistent`);

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: {
        code: "NOT_FOUND",
        message: "API route not found",
      },
    });
  });
});
