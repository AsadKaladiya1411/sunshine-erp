import { describe, expect, it } from "@jest/globals";
import { AuthorizationService } from "./authorization.service.js";

describe("AuthorizationService", () => {
  it("checks exact permission codes and any/all combinations", async () => {
    const service = new AuthorizationService({
      async getEffectivePermissionCodes() {
        return ["system.health.read", "system.docs.read"];
      },
    });

    await expect(
      service.hasPermission("user-a", "organization-a", "system.health.read"),
    ).resolves.toBe(true);
    await expect(
      service.hasPermission("user-a", "organization-a", "Admin"),
    ).resolves.toBe(false);
    await expect(
      service.hasAnyPermission("user-a", "organization-a", [
        "missing",
        "system.docs.read",
      ]),
    ).resolves.toBe(true);
    await expect(
      service.hasAllPermissions("user-a", "organization-a", [
        "system.health.read",
        "system.docs.read",
      ]),
    ).resolves.toBe(true);
  });

  it("denies missing permissions with the standardized authorization error", async () => {
    const service = new AuthorizationService({
      async getEffectivePermissionCodes() {
        return [];
      },
    });

    await expect(
      service.requirePermission(
        "user-a",
        "organization-a",
        "system.health.read",
      ),
    ).rejects.toMatchObject({
      code: "AUTHORIZATION_ERROR",
      statusCode: 403,
    });
  });

  it("fails closed when permission resolution fails", async () => {
    const service = new AuthorizationService({
      async getEffectivePermissionCodes() {
        throw new Error("database unavailable");
      },
    });

    await expect(
      service.hasPermission("user-a", "organization-a", "system.health.read"),
    ).resolves.toBe(false);
  });
});
