import { once } from "node:events";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

import { env } from "@sunshine-erp/config";
import { afterAll, beforeAll, describe, expect, it, jest } from "@jest/globals";

import app from "../../app.js";
import { PasswordService } from "../../core/auth/password.service.js";
import { prisma } from "../../core/database/prisma.js";
import { authenticationService } from "./services/authentication.service.js";

const initialPassword = "Initial-Password-2026";
const changedPassword = "Changed-Password-2026";
const resetPassword = "Reset-Password-2026";
const trustedOrigin = "http://localhost:3000";
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const organizationCode = `AUTH-${suffix}`.slice(0, 50);

type TestUserName =
  | "main"
  | "inactive"
  | "disabled"
  | "locked"
  | "failures"
  | "successfulReset"
  | "expired"
  | "revoked"
  | "logout"
  | "change"
  | "passwordReset"
  | "sessionLimit";

interface TestUser {
  readonly id: string;
  readonly username: string;
  readonly email: string;
}

interface LoginResult {
  readonly response: Response;
  readonly accessToken?: string;
  readonly cookie?: string;
}

jest.setTimeout(180_000);

describe("authentication HTTP and PostgreSQL integration", () => {
  let server: Server;
  let baseUrl: string;
  let organizationId: string;
  const users = new Map<TestUserName, TestUser>();

  async function request(
    path: string,
    init: RequestInit = {},
  ): Promise<Response> {
    return fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
    });
  }

  function extractCookie(response: Response): string | undefined {
    const setCookie = response.headers.get("set-cookie");
    return setCookie?.split(";", 1)[0];
  }

  async function extractAccessToken(response: Response): Promise<string | undefined> {
    const body: unknown = await response.json();
    if (
      typeof body === "object" &&
      body !== null &&
      "data" in body &&
      typeof body.data === "object" &&
      body.data !== null &&
      "accessToken" in body.data &&
      typeof body.data.accessToken === "string"
    ) {
      return body.data.accessToken;
    }
    return undefined;
  }

  async function login(
    userName: TestUserName,
    password = initialPassword,
    identity: "username" | "email" = "username",
  ): Promise<LoginResult> {
    const user = users.get(userName);
    if (!user) {
      throw new Error(`Missing test user ${userName}.`);
    }
    const response = await request("/api/v1/auth/login", {
      method: "POST",
      headers: {
        "User-Agent": "Authentication-Integration-Agent/1.0",
        "Sec-CH-UA-Platform": '"Windows"',
        "Sec-CH-UA-Mobile": "?0",
      },
      body: JSON.stringify({
        organizationCode,
        [identity]: user[identity],
        password,
      }),
    });
    const cookie = extractCookie(response);
    const accessToken = response.ok
      ? await extractAccessToken(response.clone())
      : undefined;
    return { response, accessToken, cookie };
  }

  beforeAll(async () => {
    const passwordHash = await new PasswordService().hash(initialPassword);
    const organization = await prisma.organization.create({
      data: {
        organizationCode,
        organizationName: `Authentication Test ${suffix}`.slice(0, 150),
        status: "Active",
      },
    });
    organizationId = organization.id;
    const department = await prisma.department.create({
      data: {
        organizationId,
        departmentCode: "AUTH",
        departmentName: "Authentication Testing",
        status: "Active",
      },
    });
    await prisma.organizationSetting.create({
      data: {
        organizationId,
        defaultCurrency: "INR",
        defaultLanguage: "en",
        defaultTimeZone: "Asia/Calcutta",
        dateFormat: "DD-MM-YYYY",
        maxConcurrentSessions: 5,
        status: "Active",
      },
    });

    const definitions: readonly [TestUserName, string, Date | null][] = [
      ["main", "Active", null],
      ["inactive", "Inactive", null],
      ["disabled", "Disabled", null],
      ["locked", "Active", new Date(Date.now() + 15 * 60_000)],
      ["failures", "Active", null],
      ["successfulReset", "Active", null],
      ["expired", "Active", null],
      ["revoked", "Active", null],
      ["logout", "Active", null],
      ["change", "Active", null],
      ["passwordReset", "Active", null],
      ["sessionLimit", "Active", null],
    ];
    for (const [name, status, lockedUntil] of definitions) {
      const username = `${name}-${suffix}`.slice(0, 100);
      const email = `${name}-${suffix}@test.invalid`.slice(0, 150);
      const user = await prisma.user.create({
        data: {
          organizationId,
          departmentId: department.id,
          firstName: name,
          email,
          username,
          passwordHash,
          status,
          lockedUntil,
          failedLoginAttempts: name === "successfulReset" ? 3 : 0,
        },
      });
      users.set(name, { id: user.id, username, email });
    }

    server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
    if (organizationId) {
      await prisma.activityLog.deleteMany({ where: { organizationId } });
      await prisma.passwordResetToken.deleteMany({ where: { organizationId } });
      await prisma.userSessionTokenHistory.deleteMany({ where: { organizationId } });
      await prisma.userPasswordHistory.deleteMany({ where: { organizationId } });
      await prisma.userSession.deleteMany({ where: { organizationId } });
      await prisma.organizationSetting.deleteMany({ where: { organizationId } });
      await prisma.user.deleteMany({ where: { organizationId } });
      await prisma.department.deleteMany({ where: { organizationId } });
      await prisma.organization.delete({ where: { id: organizationId } });
    }
    await prisma.$disconnect();
  });

  it("logs in by organization-scoped username or email and creates a secure session cookie", async () => {
    const byUsername = await login("main");
    expect(byUsername.response.status).toBe(200);
    expect(byUsername.accessToken).toBeDefined();
    expect(byUsername.cookie).toContain(`${env.REFRESH_COOKIE_NAME}=`);
    const setCookie = byUsername.response.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Strict");
    expect(setCookie).toContain(`Path=${env.REFRESH_COOKIE_PATH}`);
    expect(setCookie).not.toContain("Secure");
    await expect(
      prisma.activityLog.findFirstOrThrow({
        where: {
          userId: users.get("main")?.id,
          action: "LoginSucceeded",
        },
        orderBy: { performedAt: "desc" },
      }),
    ).resolves.toMatchObject({
      organizationId,
      module: "Authentication",
      ipAddress: "127.0.0.1",
      userAgent: "Authentication-Integration-Agent/1.0",
      deviceInfo: { platform: "Windows", mobile: false },
    });

    const byEmail = await login("main", initialPassword, "email");
    expect(byEmail.response.status).toBe(200);
    await expect(
      prisma.userSession.count({
        where: { organizationId, userId: users.get("main")?.id, status: "Active" },
      }),
    ).resolves.toBe(2);

    const resetAccount = await login("successfulReset");
    expect(resetAccount.response.status).toBe(200);
    await expect(
      prisma.user.findUniqueOrThrow({ where: { id: users.get("successfulReset")?.id } }),
    ).resolves.toMatchObject({ failedLoginAttempts: 0, lockedUntil: null });
  });

  it("uses generic failures for isolation and lifecycle states and locks at five failures", async () => {
    const main = users.get("main");
    if (!main) throw new Error("Missing main test user.");
    const wrongOrganization = await request("/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({
        organizationCode: "DIFFERENT-ORGANIZATION",
        username: main.username,
        password: initialPassword,
      }),
    });
    expect(wrongOrganization.status).toBe(401);

    for (const state of ["inactive", "disabled", "locked"] as const) {
      const result = await login(state);
      expect(result.response.status).toBe(401);
      await expect(result.response.json()).resolves.toMatchObject({
        error: { code: "INVALID_CREDENTIALS" },
      });
    }

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const result = await login("failures", "Wrong-Password-2026");
      expect(result.response.status).toBe(401);
    }
    const failureUser = await prisma.user.findUniqueOrThrow({
      where: { id: users.get("failures")?.id },
    });
    expect(failureUser.failedLoginAttempts).toBe(5);
    expect(failureUser.lockedUntil?.getTime()).toBeGreaterThan(Date.now());
    expect((await login("failures")).response.status).toBe(401);
    await expect(
      prisma.activityLog.findFirstOrThrow({
        where: { userId: failureUser.id, action: "LoginFailed" },
      }),
    ).resolves.toMatchObject({ organizationId });
    await expect(
      prisma.activityLog.findFirstOrThrow({
        where: { userId: failureUser.id, action: "AccountLocked" },
      }),
    ).resolves.toMatchObject({ organizationId });
  });

  it("rotates refresh tokens and compromises the family when a retired token is reused", async () => {
    const loggedIn = await login("main");
    expect(loggedIn.cookie).toBeDefined();
    const originalSession = await prisma.userSession.findFirstOrThrow({
      where: { organizationId, sessionTokenHash: { not: "" }, userId: users.get("main")?.id },
      orderBy: { loginAt: "desc" },
    });
    const refreshResponse = await request("/api/v1/auth/refresh", {
      method: "POST",
      headers: { Cookie: loggedIn.cookie ?? "", Origin: trustedOrigin },
    });
    expect(refreshResponse.status).toBe(200);
    const replacementCookie = extractCookie(refreshResponse);
    expect(replacementCookie).toBeDefined();
    expect(replacementCookie).not.toBe(loggedIn.cookie);
    await expect(
      prisma.userSessionTokenHistory.count({ where: { userSessionId: originalSession.id } }),
    ).resolves.toBe(1);

    const reuseResponse = await request("/api/v1/auth/refresh", {
      method: "POST",
      headers: { Cookie: loggedIn.cookie ?? "", Origin: trustedOrigin },
    });
    expect(reuseResponse.status).toBe(401);
    await expect(
      prisma.userSession.findUniqueOrThrow({ where: { id: originalSession.id } }),
    ).resolves.toMatchObject({
      status: "Compromised",
      revocationReason: "RefreshTokenReuse",
    });
    await expect(
      prisma.activityLog.findFirstOrThrow({
        where: {
          userId: users.get("main")?.id,
          action: "RefreshTokenCompromised",
          recordId: originalSession.id,
        },
      }),
    ).resolves.toMatchObject({ organizationId });
  });

  it("rejects missing Origin, expired sessions, and revoked sessions during refresh", async () => {
    const noOrigin = await login("expired");
    expect(
      (await request("/api/v1/auth/refresh", {
        method: "POST",
        headers: { Cookie: noOrigin.cookie ?? "" },
      })).status,
    ).toBe(403);
    const expiredSession = await prisma.userSession.findFirstOrThrow({
      where: { userId: users.get("expired")?.id },
      orderBy: { loginAt: "desc" },
    });
    await prisma.userSession.update({
      where: { id: expiredSession.id },
      data: { expiresAt: new Date(Date.now() - 1_000) },
    });
    expect(
      (await request("/api/v1/auth/refresh", {
        method: "POST",
        headers: { Cookie: noOrigin.cookie ?? "", Origin: trustedOrigin },
      })).status,
    ).toBe(401);
    await expect(
      prisma.userSession.findUniqueOrThrow({ where: { id: expiredSession.id } }),
    ).resolves.toMatchObject({ status: "Expired" });

    const revoked = await login("revoked");
    const revokedSession = await prisma.userSession.findFirstOrThrow({
      where: { userId: users.get("revoked")?.id },
      orderBy: { loginAt: "desc" },
    });
    await prisma.userSession.update({
      where: { id: revokedSession.id },
      data: { status: "Revoked", revokedAt: new Date(), revocationReason: "Test" },
    });
    expect(
      (await request("/api/v1/auth/refresh", {
        method: "POST",
        headers: { Cookie: revoked.cookie ?? "", Origin: trustedOrigin },
      })).status,
    ).toBe(401);
  });

  it("returns safe current-user identity and rejects unauthenticated access", async () => {
    expect((await request("/api/v1/auth/me")).status).toBe(401);
    const loggedIn = await login("main");
    const response = await request("/api/v1/auth/me", {
      headers: { Authorization: `Bearer ${loggedIn.accessToken}` },
    });
    expect(response.status).toBe(200);
    const bodyText = await response.text();
    expect(bodyText).toContain(organizationCode);
    expect(bodyText).not.toContain("passwordHash");
    expect(bodyText).not.toContain("sessionTokenHash");
    expect(bodyText).not.toContain("refreshToken");
  });

  it("logs out authoritatively, preserves token history, and clears the cookie", async () => {
    const loggedIn = await login("logout");
    const session = await prisma.userSession.findFirstOrThrow({
      where: { userId: users.get("logout")?.id },
      orderBy: { loginAt: "desc" },
    });
    const response = await request("/api/v1/auth/logout", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${loggedIn.accessToken}`,
        Cookie: loggedIn.cookie ?? "",
        Origin: trustedOrigin,
      },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain(
      `${env.REFRESH_COOKIE_NAME}=;`,
    );
    await expect(
      prisma.userSession.findUniqueOrThrow({ where: { id: session.id } }),
    ).resolves.toMatchObject({ status: "LoggedOut" });
    await expect(
      prisma.userSessionTokenHistory.count({ where: { userSessionId: session.id } }),
    ).resolves.toBe(1);
    await expect(
      prisma.activityLog.findFirstOrThrow({
        where: { action: "Logout", recordId: session.id },
      }),
    ).resolves.toMatchObject({ userId: users.get("logout")?.id, organizationId });
  });

  it("changes passwords with history enforcement and revokes other sessions", async () => {
    const first = await login("change");
    const second = await login("change");
    const sessions = await prisma.userSession.findMany({
      where: { userId: users.get("change")?.id },
      orderBy: { loginAt: "asc" },
    });
    const response = await request("/api/v1/auth/change-password", {
      method: "POST",
      headers: { Authorization: `Bearer ${first.accessToken}` },
      body: JSON.stringify({ currentPassword: initialPassword, newPassword: changedPassword }),
    });
    expect(response.status).toBe(200);
    await expect(
      prisma.userPasswordHistory.count({ where: { userId: users.get("change")?.id } }),
    ).resolves.toBe(1);
    await expect(
      prisma.userSession.findUniqueOrThrow({ where: { id: sessions[1]?.id } }),
    ).resolves.toMatchObject({ status: "Revoked", revocationReason: "PasswordChanged" });

    const reuse = await request("/api/v1/auth/change-password", {
      method: "POST",
      headers: { Authorization: `Bearer ${first.accessToken}` },
      body: JSON.stringify({ currentPassword: changedPassword, newPassword: initialPassword }),
    });
    expect(reuse.status).toBe(400);
    expect((await login("change", initialPassword)).response.status).toBe(401);
    expect((await login("change", changedPassword)).response.status).toBe(200);
    expect(second.accessToken).toBeDefined();
    await expect(
      prisma.activityLog.findFirstOrThrow({
        where: { userId: users.get("change")?.id, action: "PasswordChanged" },
      }),
    ).resolves.toMatchObject({ organizationId });
  });

  it("persists one-time password reset state and revokes active sessions", async () => {
    await login("passwordReset");
    const user = users.get("passwordReset");
    if (!user) throw new Error("Missing password reset test user.");
    const token = await authenticationService.createPasswordResetCredential(
      user.id,
      organizationId,
    );
    await authenticationService.resetPassword(token, resetPassword);
    await expect(
      prisma.passwordResetToken.findFirstOrThrow({ where: { userId: user.id } }),
    ).resolves.toMatchObject({ usedAt: expect.any(Date) });
    await expect(
      prisma.userSession.findFirstOrThrow({ where: { userId: user.id } }),
    ).resolves.toMatchObject({ status: "Revoked", revocationReason: "PasswordReset" });
    await expect(
      authenticationService.resetPassword(token, "Another-Password-2026"),
    ).rejects.toMatchObject({ code: "INVALID_PASSWORD_RESET_TOKEN" });
    expect((await login("passwordReset", resetPassword)).response.status).toBe(200);
    await expect(
      prisma.activityLog.findFirstOrThrow({
        where: { userId: user.id, action: "PasswordResetCompleted" },
      }),
    ).resolves.toMatchObject({ organizationId });
  });

  it("rejects a sixth active login without revoking existing sessions", async () => {
    for (let count = 0; count < 5; count += 1) {
      expect((await login("sessionLimit")).response.status).toBe(200);
    }
    const rejected = await login("sessionLimit");
    expect(rejected.response.status).toBe(409);
    await expect(
      prisma.userSession.count({
        where: { userId: users.get("sessionLimit")?.id, status: "Active" },
      }),
    ).resolves.toBe(5);
  });

  it("never persists authentication credentials in Activity Logs", async () => {
    const serializedLogs = JSON.stringify(
      await prisma.activityLog.findMany({ where: { organizationId } }),
    );
    for (const forbiddenValue of [
      initialPassword,
      changedPassword,
      resetPassword,
      "Wrong-Password-2026",
      "passwordHash",
      "sessionTokenHash",
      "refreshToken",
      "Authorization",
      env.REFRESH_COOKIE_NAME,
    ]) {
      expect(serializedLogs).not.toContain(forbiddenValue);
    }
    expect(serializedLogs).not.toMatch(/eyJ[A-Za-z0-9_-]+\./);
  });
});
