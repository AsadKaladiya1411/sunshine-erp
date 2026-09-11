import { describe, expect, it, jest } from "@jest/globals";
import {
  AuthenticationApiClient,
  type WebFetch,
} from "./auth-api-client";
import type { AuthenticatedUserIdentity } from "../auth/auth.types";

const identity: AuthenticatedUserIdentity = {
  userId: "9c223137-04a0-49dc-8844-ebfd819d8c5d",
  organizationId: "c5906f64-4f9d-41a4-b0dd-18c40e46ff90",
  organizationCode: "SUNSHINE",
  organizationName: "Sunshine Corporation",
  departmentId: "74082d3a-432c-4919-8d98-8d325b20cf63",
  departmentCode: "ADMIN",
  departmentName: "Administration",
  sessionId: "fa75d7d9-6a9f-498a-a731-8f58e489a33c",
  username: "admin",
  email: "admin@example.com",
  firstName: "First",
  lastName: "Administrator",
};

function jsonResponse(status: number, body: unknown): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: jest.fn(async () => body),
  } as unknown as Response;
}

function createFetchMock(): jest.MockedFunction<WebFetch> {
  return jest.fn<WebFetch>();
}

function headerFromCall(
  fetchMock: jest.MockedFunction<WebFetch>,
  callIndex: number,
  name: string,
): string | null {
  const options = fetchMock.mock.calls[callIndex]?.[1];
  return new Headers(options?.headers).get(name);
}

describe("AuthenticationApiClient", () => {
  it.each([
    { baseUrl: undefined, configurationState: "missing" },
    { baseUrl: "   ", configurationState: "blank" },
    { baseUrl: "not-a-url", configurationState: "malformed" },
  ])(
    "preserves the Web API configuration error when the base URL is $configurationState",
    async ({ baseUrl }) => {
      const configuredBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
      delete process.env.NEXT_PUBLIC_API_BASE_URL;
      const fetchMock = createFetchMock();

      try {
        const client = new AuthenticationApiClient(
          baseUrl,
          fetchMock,
          () => "configuration-correlation-id",
        );

        await expect(
          client.login({
            organizationCode: "SUNSHINE",
            username: "admin",
            password: "valid-password",
          }),
        ).rejects.toMatchObject({
          code: "WEB_API_CONFIGURATION_ERROR",
          status: null,
        });
        expect(fetchMock).not.toHaveBeenCalled();
      } finally {
        if (configuredBaseUrl === undefined) {
          delete process.env.NEXT_PUBLIC_API_BASE_URL;
        } else {
          process.env.NEXT_PUBLIC_API_BASE_URL = configuredBaseUrl;
        }
      }
    },
  );

  it("logs in, retains the access token only in memory, and sends typed request metadata", async () => {
    const fetchMock = createFetchMock();
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(200, {
          success: true,
          data: {
            accessToken: "access-token",
            tokenType: "Bearer",
            expiresIn: 900,
            user: identity,
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, { success: true, data: identity }),
      );
    const client = new AuthenticationApiClient(
      "http://localhost:4000",
      fetchMock,
      () => "web-correlation-id",
    );

    await expect(
      client.login({
        organizationCode: "SUNSHINE",
        username: "admin",
        password: "valid-password",
      }),
    ).resolves.toEqual(identity);
    expect(client.hasAccessToken()).toBe(true);
    expect(localStorage).toHaveLength(0);
    expect(sessionStorage).toHaveLength(0);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "http://localhost:4000/api/v1/auth/login",
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      credentials: "include",
    });
    expect(headerFromCall(fetchMock, 0, "X-Correlation-ID")).toBe(
      "web-correlation-id",
    );
    expect(headerFromCall(fetchMock, 0, "Authorization")).toBeNull();

    await client.getCurrentUser();
    expect(headerFromCall(fetchMock, 1, "Authorization")).toBe(
      "Bearer access-token",
    );
  });

  it("restores a browser session by refreshing once and then loading /me", async () => {
    const fetchMock = createFetchMock();
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(200, {
          success: true,
          data: {
            accessToken: "restored-token",
            tokenType: "Bearer",
            expiresIn: 900,
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, { success: true, data: identity }),
      );
    const client = new AuthenticationApiClient(
      "http://localhost:4000",
      fetchMock,
      () => "restore-correlation-id",
    );

    await expect(client.restoreSession()).resolves.toEqual(identity);
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      "http://localhost:4000/api/v1/auth/refresh",
      "http://localhost:4000/api/v1/auth/me",
    ]);
    expect(fetchMock.mock.calls[0]?.[1]?.credentials).toBe("include");
    expect(headerFromCall(fetchMock, 1, "Authorization")).toBe(
      "Bearer restored-token",
    );
  });

  it("shares one in-flight refresh across concurrent unauthorized requests and retries each once", async () => {
    let releaseRefresh: ((response: Response) => void) | undefined;
    const pendingRefresh = new Promise<Response>((resolve) => {
      releaseRefresh = resolve;
    });
    let refreshCalls = 0;
    const attempts = new Map<string, number>();
    const fetchMock = jest.fn<WebFetch>(async (input, options) => {
      const url = String(input);

      if (url.endsWith("/auth/login")) {
        return jsonResponse(200, {
          success: true,
          data: {
            accessToken: "expired-token",
            tokenType: "Bearer",
            expiresIn: 900,
            user: identity,
          },
        });
      }

      if (url.endsWith("/auth/refresh")) {
        refreshCalls += 1;
        return pendingRefresh;
      }

      const count = (attempts.get(url) ?? 0) + 1;
      attempts.set(url, count);
      if (new Headers(options?.headers).get("Authorization") === "Bearer expired-token") {
        return jsonResponse(401, {
          success: false,
          error: { code: "AUTHENTICATION_ERROR", message: "Authentication required" },
        });
      }

      return jsonResponse(200, { success: true, data: { url, count } });
    });
    const client = new AuthenticationApiClient(
      "http://localhost:4000",
      fetchMock,
      () => "coordinated-correlation-id",
    );
    await client.login({
      organizationCode: "SUNSHINE",
      username: "admin",
      password: "valid-password",
    });

    const firstRequest = client.request<{ readonly count: number }>("/first", {
      authenticated: true,
    });
    const secondRequest = client.request<{ readonly count: number }>("/second", {
      authenticated: true,
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(refreshCalls).toBe(1);
    releaseRefresh?.(
      jsonResponse(200, {
        success: true,
        data: {
          accessToken: "replacement-token",
          tokenType: "Bearer",
          expiresIn: 900,
        },
      }),
    );

    await expect(Promise.all([firstRequest, secondRequest])).resolves.toEqual([
      expect.objectContaining({ count: 2 }),
      expect.objectContaining({ count: 2 }),
    ]);
    expect(refreshCalls).toBe(1);
    expect(attempts.get("http://localhost:4000/first")).toBe(2);
    expect(attempts.get("http://localhost:4000/second")).toBe(2);
  });

  it("retries a delayed stale-token 401 with the current token without refreshing again", async () => {
    let releaseDelayedUnauthorized: ((response: Response) => void) | undefined;
    const delayedUnauthorized = new Promise<Response>((resolve) => {
      releaseDelayedUnauthorized = resolve;
    });
    let refreshCalls = 0;
    let secondAttempts = 0;
    const fetchMock = jest.fn<WebFetch>(async (input, options) => {
      const url = String(input);
      const authorization = new Headers(options?.headers).get("Authorization");

      if (url.endsWith("/auth/login")) {
        return jsonResponse(200, {
          success: true,
          data: {
            accessToken: "initial-token",
            tokenType: "Bearer",
            expiresIn: 900,
            user: identity,
          },
        });
      }

      if (url.endsWith("/auth/refresh")) {
        refreshCalls += 1;
        return jsonResponse(200, {
          success: true,
          data: {
            accessToken: "refreshed-token",
            tokenType: "Bearer",
            expiresIn: 900,
          },
        });
      }

      if (url.endsWith("/first")) {
        if (authorization === "Bearer initial-token") {
          return jsonResponse(401, {
            success: false,
            error: {
              code: "AUTHENTICATION_ERROR",
              message: "Authentication required",
            },
          });
        }

        return jsonResponse(200, { success: true, data: { completed: true } });
      }

      secondAttempts += 1;
      if (secondAttempts === 1) {
        return delayedUnauthorized;
      }

      return jsonResponse(200, {
        success: true,
        data: { authorization },
      });
    });
    const client = new AuthenticationApiClient(
      "http://localhost:4000",
      fetchMock,
      () => "delayed-correlation-id",
    );
    await client.login({
      organizationCode: "SUNSHINE",
      username: "admin",
      password: "valid-password",
    });

    const firstRequest = client.request<{ readonly completed: boolean }>(
      "/first",
      { authenticated: true },
    );
    const secondRequest = client.request<{ readonly authorization: string }>(
      "/second",
      { authenticated: true },
    );

    await expect(firstRequest).resolves.toEqual({ completed: true });
    expect(refreshCalls).toBe(1);
    releaseDelayedUnauthorized?.(
      jsonResponse(401, {
        success: false,
        error: {
          code: "AUTHENTICATION_ERROR",
          message: "Authentication required",
        },
      }),
    );

    await expect(secondRequest).resolves.toEqual({
      authorization: "Bearer refreshed-token",
    });
    expect(refreshCalls).toBe(1);
    expect(secondAttempts).toBe(2);
  });

  it("does not let a redundant refresh failure clear the replacement token", async () => {
    let releaseDelayedUnauthorized: ((response: Response) => void) | undefined;
    const delayedUnauthorized = new Promise<Response>((resolve) => {
      releaseDelayedUnauthorized = resolve;
    });
    let refreshCalls = 0;
    let delayedAttempts = 0;
    const fetchMock = jest.fn<WebFetch>(async (input, options) => {
      const url = String(input);
      const authorization = new Headers(options?.headers).get("Authorization");

      if (url.endsWith("/auth/login")) {
        return jsonResponse(200, {
          success: true,
          data: {
            accessToken: "initial-token",
            tokenType: "Bearer",
            expiresIn: 900,
            user: identity,
          },
        });
      }

      if (url.endsWith("/auth/refresh")) {
        refreshCalls += 1;
        if (refreshCalls > 1) {
          return jsonResponse(401, {
            success: false,
            error: {
              code: "INVALID_REFRESH_TOKEN",
              message: "Refresh failed",
            },
          });
        }

        return jsonResponse(200, {
          success: true,
          data: {
            accessToken: "replacement-token",
            tokenType: "Bearer",
            expiresIn: 900,
          },
        });
      }

      if (url.endsWith("/refresh-trigger")) {
        if (authorization === "Bearer initial-token") {
          return jsonResponse(401, {
            success: false,
            error: {
              code: "AUTHENTICATION_ERROR",
              message: "Authentication required",
            },
          });
        }

        return jsonResponse(200, { success: true, data: { completed: true } });
      }

      if (url.endsWith("/delayed")) {
        delayedAttempts += 1;
        if (delayedAttempts === 1) {
          return delayedUnauthorized;
        }
      }

      return jsonResponse(200, {
        success: true,
        data: { authorization },
      });
    });
    const client = new AuthenticationApiClient(
      "http://localhost:4000",
      fetchMock,
      () => "failure-protection-correlation-id",
    );
    await client.login({
      organizationCode: "SUNSHINE",
      username: "admin",
      password: "valid-password",
    });

    const refreshTrigger = client.request<{ readonly completed: boolean }>(
      "/refresh-trigger",
      { authenticated: true },
    );
    const delayedRequest = client.request<{ readonly authorization: string }>(
      "/delayed",
      { authenticated: true },
    );

    await expect(refreshTrigger).resolves.toEqual({ completed: true });
    releaseDelayedUnauthorized?.(
      jsonResponse(401, {
        success: false,
        error: {
          code: "AUTHENTICATION_ERROR",
          message: "Authentication required",
        },
      }),
    );

    await expect(delayedRequest).resolves.toEqual({
      authorization: "Bearer replacement-token",
    });
    await expect(
      client.request<{ readonly authorization: string }>("/verify", {
        authenticated: true,
      }),
    ).resolves.toEqual({ authorization: "Bearer replacement-token" });
    expect(refreshCalls).toBe(1);
    expect(client.hasAccessToken()).toBe(true);
  });

  it("refreshes a current-token 401 and retries with the replacement token", async () => {
    let refreshCalls = 0;
    let protectedCalls = 0;
    const fetchMock = jest.fn<WebFetch>(async (input, options) => {
      const url = String(input);

      if (url.endsWith("/auth/login")) {
        return jsonResponse(200, {
          success: true,
          data: {
            accessToken: "current-token",
            tokenType: "Bearer",
            expiresIn: 900,
            user: identity,
          },
        });
      }

      if (url.endsWith("/auth/refresh")) {
        refreshCalls += 1;
        return jsonResponse(200, {
          success: true,
          data: {
            accessToken: "replacement-token",
            tokenType: "Bearer",
            expiresIn: 900,
          },
        });
      }

      protectedCalls += 1;
      const authorization = new Headers(options?.headers).get("Authorization");
      if (protectedCalls === 1) {
        expect(authorization).toBe("Bearer current-token");
        return jsonResponse(401, {
          success: false,
          error: {
            code: "AUTHENTICATION_ERROR",
            message: "Authentication required",
          },
        });
      }

      return jsonResponse(200, {
        success: true,
        data: { authorization },
      });
    });
    const client = new AuthenticationApiClient(
      "http://localhost:4000",
      fetchMock,
      () => "normal-refresh-correlation-id",
    );
    await client.login({
      organizationCode: "SUNSHINE",
      username: "admin",
      password: "valid-password",
    });

    await expect(
      client.request<{ readonly authorization: string }>("/protected", {
        authenticated: true,
      }),
    ).resolves.toEqual({ authorization: "Bearer replacement-token" });
    expect(refreshCalls).toBe(1);
    expect(protectedCalls).toBe(2);
  });

  it("does not refresh again when the one allowed retry also returns 401", async () => {
    let refreshCalls = 0;
    let protectedCalls = 0;
    const fetchMock = jest.fn<WebFetch>(async (input) => {
      const url = String(input);

      if (url.endsWith("/auth/login")) {
        return jsonResponse(200, {
          success: true,
          data: {
            accessToken: "current-token",
            tokenType: "Bearer",
            expiresIn: 900,
            user: identity,
          },
        });
      }

      if (url.endsWith("/auth/refresh")) {
        refreshCalls += 1;
        return jsonResponse(200, {
          success: true,
          data: {
            accessToken: "replacement-token",
            tokenType: "Bearer",
            expiresIn: 900,
          },
        });
      }

      protectedCalls += 1;
      return jsonResponse(401, {
        success: false,
        error: {
          code: "AUTHENTICATION_ERROR",
          message: "Authentication required",
        },
      });
    });
    const client = new AuthenticationApiClient(
      "http://localhost:4000",
      fetchMock,
      () => "single-retry-correlation-id",
    );
    await client.login({
      organizationCode: "SUNSHINE",
      username: "admin",
      password: "valid-password",
    });

    await expect(
      client.request("/protected", { authenticated: true }),
    ).rejects.toMatchObject({
      code: "AUTHENTICATION_ERROR",
      status: 401,
    });
    expect(refreshCalls).toBe(1);
    expect(protectedCalls).toBe(2);
    expect(client.hasAccessToken()).toBe(false);
  });

  it("logs out through the backend and always clears the memory token", async () => {
    const fetchMock = createFetchMock();
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(200, {
          success: true,
          data: {
            accessToken: "logout-token",
            tokenType: "Bearer",
            expiresIn: 900,
            user: identity,
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, { success: true, data: { loggedOut: true } }),
      );
    const client = new AuthenticationApiClient(
      "http://localhost:4000",
      fetchMock,
      () => "logout-correlation-id",
    );
    await client.login({
      organizationCode: "SUNSHINE",
      username: "admin",
      password: "valid-password",
    });

    await client.logout();

    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      "http://localhost:4000/api/v1/auth/logout",
    );
    expect(fetchMock.mock.calls[1]?.[1]?.credentials).toBe("include");
    expect(headerFromCall(fetchMock, 1, "Authorization")).toBe(
      "Bearer logout-token",
    );
    expect(client.hasAccessToken()).toBe(false);
  });

  it.each([
    ["VALIDATION_ERROR", 400],
    ["INVALID_CREDENTIALS", 401],
    ["SESSION_LIMIT_REACHED", 409],
    ["RATE_LIMIT_EXCEEDED", 429],
  ])("preserves backend error %s", async (code, status) => {
    const fetchMock = createFetchMock();
    fetchMock.mockResolvedValueOnce(
      jsonResponse(status, {
        success: false,
        error: { code, message: `Backend ${code}` },
      }),
    );
    const client = new AuthenticationApiClient(
      "http://localhost:4000",
      fetchMock,
      () => "error-correlation-id",
    );

    await expect(
      client.login({
        organizationCode: "SUNSHINE",
        username: "admin",
        password: "invalid-password",
      }),
    ).rejects.toMatchObject({ code, status, message: `Backend ${code}` });
  });

  it("represents transport failures separately from authentication failures", async () => {
    const fetchMock = createFetchMock();
    fetchMock.mockRejectedValueOnce(new Error("connection details"));
    const client = new AuthenticationApiClient(
      "http://localhost:4000",
      fetchMock,
      () => "network-correlation-id",
    );

    await expect(
      client.login({
        organizationCode: "SUNSHINE",
        username: "admin",
        password: "password",
      }),
    ).rejects.toMatchObject({
      code: "NETWORK_ERROR",
      message: "Unable to connect to the Sunshine ERP API.",
    });
  });
});
