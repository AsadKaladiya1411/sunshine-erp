import { describe, expect, it } from "@jest/globals";

import { AuthorizationService } from "../../authorization/services/authorization.service.js";
import { RbacApprovalAuthorizationBoundary } from "./approval.service.js";

describe("RbacApprovalAuthorizationBoundary", () => {
  it("performs permission and active-role checks through AuthorizationService", async () => {
    const authorizationReader = {
      async getEffectivePermissionCodes(userId: string) {
        return userId === "permitted-user" ? ["approval.decide"] : [];
      },
      async findActiveAssignments(userId: string) {
        return userId === "role-user" ? [{ roleId: "role-a" }] : [];
      },
    };
    const authorization = new AuthorizationService(
      authorizationReader,
      authorizationReader,
    );
    const boundary = new RbacApprovalAuthorizationBoundary(
      "approval.decide",
      authorization,
    );

    await expect(
      boundary.canPerformApproval("permitted-user", "organization-a"),
    ).resolves.toBe(true);
    await expect(
      boundary.canPerformApproval("denied-user", "organization-a"),
    ).resolves.toBe(false);
    await expect(
      boundary.hasActiveRole("role-user", "organization-a", "role-a"),
    ).resolves.toBe(true);
    await expect(
      boundary.hasActiveRole("role-user", "organization-a", "role-b"),
    ).resolves.toBe(false);
  });
});
