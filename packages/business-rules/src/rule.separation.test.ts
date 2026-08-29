import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "@jest/globals";
import { createRuleDefinition } from "./rule.definition.js";
import { BusinessRulesEngine } from "./rule.engine.js";

describe("business rules responsibility and security separation", () => {
  it("does not interpret Workflow, Approval, or RBAC context itself", () => {
    const definition = createRuleDefinition({
      ruleId: "foundation.separation",
      version: 1,
      enabled: true,
      evaluator: (input: Readonly<{ matches: boolean }>) => ({
        matched: input.matches,
        result: "explicit-evaluator-only",
      }),
    });
    const context = {
      workflowTransitionAllowed: false,
      approvalStatus: "Rejected",
      hasPermission: false,
    };

    const result = new BusinessRulesEngine().evaluate(
      definition,
      { matches: true },
      context,
    );

    expect(result.matched).toBe(true);
    expect(context).toEqual({
      workflowTransitionAllowed: false,
      approvalStatus: "Rejected",
      hasPermission: false,
    });
  });

  it("has no imports from Workflow, Approval, RBAC, API, Prisma, or infrastructure", async () => {
    const sourceFiles = [
      "rule.definition.ts",
      "rule.engine.ts",
      "rule.errors.ts",
      "rule.registry.ts",
    ];
    const sources = await Promise.all(
      sourceFiles.map((file) =>
        readFile(fileURLToPath(new URL(file, import.meta.url)), "utf8"),
      ),
    );
    const productionSource = sources.join("\n");

    expect(productionSource).not.toMatch(/@sunshine-erp\/workflow/);
    expect(productionSource).not.toMatch(/modules\/approval/);
    expect(productionSource).not.toMatch(/authorization/);
    expect(productionSource).not.toMatch(/@prisma|PrismaClient/);
    expect(productionSource).not.toMatch(/process\.env/);
    expect(productionSource).not.toMatch(/kafka|worker|outbox|redis/i);
  });

  it("contains no arbitrary expression or JavaScript execution mechanism", async () => {
    const sourceFiles = [
      "rule.definition.ts",
      "rule.engine.ts",
      "rule.registry.ts",
    ];
    const sources = await Promise.all(
      sourceFiles.map((file) =>
        readFile(fileURLToPath(new URL(file, import.meta.url)), "utf8"),
      ),
    );
    const productionSource = sources.join("\n");

    expect(productionSource).not.toMatch(/\beval\s*\(/);
    expect(productionSource).not.toMatch(/new\s+Function\b/);
    expect(productionSource).not.toMatch(/node:vm|child_process/);
  });
});
