import { once } from "node:events";
import { afterEach, expect, it, jest } from "@jest/globals";
import * as configuration from "@sunshine-erp/config";
import express from "express";

afterEach(() => {
  jest.unstable_mockModule("@sunshine-erp/config", () => configuration);
  jest.resetModules();
});

it.each(["strict", "lax", "none"])(
  "retains production Secure and SameSite=%s when setting and clearing cookies",
  async (sameSite) => {
    // Production is a parsed fixture only; the DB test environment stays intact.
    const env = configuration.parseEnvironment({
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://localhost:5432/sunshine_erp_test",
      JWT_SECRET: "test-only-cookie-jwt-secret-at-least-32-characters",
      REFRESH_TOKEN_DIGEST_SECRET:
        "test-only-cookie-refresh-secret-at-least-32-characters",
      REFRESH_COOKIE_SECURE: "true",
      REFRESH_COOKIE_SAME_SITE: sameSite,
    });
    jest.resetModules();
    jest.unstable_mockModule("@sunshine-erp/config", () => ({ env }));
    const { setRefreshTokenCookie, clearRefreshTokenCookie } = await import(
      "./refresh-cookie.js"
    );

    // Exercise real Express header serialization, not browser HTTPS enforcement.
    const app = express();
    app.get("/set", (_request, response) => {
      setRefreshTokenCookie(response, "test-only-refresh-credential");
      response.sendStatus(204);
    });
    app.get("/clear", (_request, response) => {
      clearRefreshTokenCookie(response);
      response.sendStatus(204);
    });
    const server = app.listen(0, "127.0.0.1");
    try {
      await once(server, "listening");
      const address = server.address();
      if (!address || typeof address === "string") {
        throw new Error("Expected a local test server port.");
      }
      for (const operation of ["set", "clear"]) {
        const response = await fetch(`http://127.0.0.1:${address.port}/${operation}`);
        expect(response.status).toBe(204);
        const header = response.headers.get("set-cookie") ?? "";
        expect(header).toContain("; Secure");
        expect(header).toContain("; HttpOnly");
        expect(header).toContain(`Path=${env.REFRESH_COOKIE_PATH}`);
        expect(header.toLowerCase()).toContain(`samesite=${sameSite}`);
        if (operation === "set") {
          expect(header).toContain(
            `${env.REFRESH_COOKIE_NAME}=test-only-refresh-credential;`,
          );
          expect(header).toContain(`Max-Age=${env.REFRESH_TOKEN_LIFETIME_SECONDS}`);
        } else {
          expect(header).toContain(`${env.REFRESH_COOKIE_NAME}=;`);
          expect(header).toContain("Expires=Thu, 01 Jan 1970 00:00:00 GMT");
        }
      }
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      });
    }
  },
);
