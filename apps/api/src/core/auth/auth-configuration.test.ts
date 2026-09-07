import { describe, expect, it } from "@jest/globals";
import { parseEnvironment } from "@sunshine-erp/config";

const baseEnvironment = {
  DATABASE_URL: "postgresql://localhost:5432/sunshine_erp_test",
  JWT_SECRET: "test-only-configuration-jwt-secret-at-least-32-characters",
  REFRESH_TOKEN_DIGEST_SECRET:
    "test-only-configuration-refresh-secret-at-least-32-characters",
};

function cookieIssue(message: string) {
  return expect.objectContaining({
    issues: expect.arrayContaining([
      expect.objectContaining({
        path: ["REFRESH_COOKIE_SECURE"],
        message,
      }),
    ]),
  });
}

describe("production refresh-cookie configuration", () => {
  describe.each(["strict", "lax", "none"])("SameSite=%s", (sameSite) => {
    it.each(["false", undefined])(
      "rejects production Secure=%s on the cookie configuration field",
      (secure) => {
        expect(() =>
          parseEnvironment({
            ...baseEnvironment,
            NODE_ENV: "production",
            REFRESH_COOKIE_SECURE: secure,
            REFRESH_COOKIE_SAME_SITE: sameSite,
          }),
        ).toThrow(cookieIssue("REFRESH_COOKIE_SECURE must be true in production."));
      },
    );

    it("accepts production Secure=true", () => {
      expect(
        parseEnvironment({
          ...baseEnvironment,
          NODE_ENV: "production",
          REFRESH_COOKIE_SECURE: "true",
          REFRESH_COOKIE_SAME_SITE: sameSite,
        }),
      ).toMatchObject({
        REFRESH_COOKIE_SECURE: true,
        REFRESH_COOKIE_SAME_SITE: sameSite,
      });
    });
  });

  describe.each(["development", "test"])("%s HTTP support", (environment) => {
    describe.each(["strict", "lax"])("SameSite=%s", (sameSite) => {
      it.each(["false", undefined])("accepts Secure=%s", (secure) => {
        expect(
          parseEnvironment({
            ...baseEnvironment,
            NODE_ENV: environment,
            REFRESH_COOKIE_SECURE: secure,
            REFRESH_COOKIE_SAME_SITE: sameSite,
          }),
        ).toMatchObject({
          REFRESH_COOKIE_SECURE: false,
          REFRESH_COOKIE_SAME_SITE: sameSite,
        });
      });
    });
  });

  describe.each(["production", "development", "test"])(
    "%s SameSite=None requirement",
    (environment) => {
      it.each(["false", undefined])("rejects Secure=%s", (secure) => {
        expect(() =>
          parseEnvironment({
            ...baseEnvironment,
            NODE_ENV: environment,
            REFRESH_COOKIE_SECURE: secure,
            REFRESH_COOKIE_SAME_SITE: "none",
          }),
        ).toThrow(cookieIssue("SameSite=None refresh cookies must be Secure."));
      });

      it("accepts Secure=true", () => {
        expect(
          parseEnvironment({
            ...baseEnvironment,
            NODE_ENV: environment,
            REFRESH_COOKIE_SECURE: "true",
            REFRESH_COOKIE_SAME_SITE: "none",
          }),
        ).toMatchObject({
          REFRESH_COOKIE_SECURE: true,
          REFRESH_COOKIE_SAME_SITE: "none",
        });
      });
    },
  );
});
