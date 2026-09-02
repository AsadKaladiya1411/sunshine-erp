import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "@jest/globals";

const approvalServicePath = fileURLToPath(
  new URL("../approval/services/approval.service.ts", import.meta.url),
);
const authorizationRepositoryPaths = [
  "./repositories/permission.repository.ts",
  "./repositories/role-permission.repository.ts",
  "./repositories/user-role-assignment.repository.ts",
].map((path) => fileURLToPath(new URL(path, import.meta.url)));

describe("Approval and Authorization dependency boundaries", () => {
  it("keeps Approval behind AuthorizationService and AuditService out of Authorization repositories", async () => {
    const approvalService = await readFile(approvalServicePath, "utf8");
    expect(approvalService).toContain(
      "../../authorization/services/authorization.service.js",
    );
    expect(approvalService).not.toContain("authorization/repositories/");

    const repositorySources = await Promise.all(
      authorizationRepositoryPaths.map((path) => readFile(path, "utf8")),
    );
    for (const repositorySource of repositorySources) {
      expect(repositorySource).not.toContain("audit.service");
      expect(repositorySource).not.toContain("AuditService");
      expect(repositorySource).not.toContain("SECURITY_ACTIVITY_ACTIONS");
    }
  });
});
