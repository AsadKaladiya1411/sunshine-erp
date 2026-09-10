import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import { ActivityLogRepository } from "../../core/audit/activity-log.repository.js";
import { AuditService } from "../../core/audit/audit.service.js";
import { prisma } from "../../core/database/prisma.js";
import { ConflictError } from "../../core/http/errors.js";
import { OrganizationRepository } from "./repositories/organization.repository.js";

const suffix = randomUUID().replaceAll("-", "").slice(0, 12);

describe("OrganizationRepository PostgreSQL integration", () => {
  const repository = new OrganizationRepository(prisma);
  const audit = new AuditService(new ActivityLogRepository(prisma));
  let organizationId: string;
  let otherOrganizationId: string;
  let userId: string;
  let otherUserId: string;
  let countryId: string;
  let stateId: string;
  let cityId: string;
  let otherCountryId: string;
  let otherStateId: string;

  beforeAll(async () => {
    const country = await prisma.country.create({
      data: { code: `C-${suffix}`, name: `Country ${suffix}`, status: "Active" },
    });
    countryId = country.id;
    const state = await prisma.state.create({
      data: {
        countryId,
        code: `S-${suffix}`,
        name: `State ${suffix}`,
        status: "Active",
      },
    });
    stateId = state.id;
    const city = await prisma.city.create({
      data: {
        stateId,
        code: `CT-${suffix}`,
        name: `City ${suffix}`,
        status: "Active",
      },
    });
    cityId = city.id;

    const otherCountry = await prisma.country.create({
      data: {
        code: `OC-${suffix}`,
        name: `Other Country ${suffix}`,
        status: "Active",
      },
    });
    otherCountryId = otherCountry.id;
    const otherState = await prisma.state.create({
      data: {
        countryId: otherCountryId,
        code: `OS-${suffix}`,
        name: `Other State ${suffix}`,
        status: "Active",
      },
    });
    otherStateId = otherState.id;

    const organization = await prisma.organization.create({
      data: {
        organizationCode: `ORG-${suffix}`,
        organizationName: `Organization ${suffix}`,
        status: "Active",
      },
    });
    organizationId = organization.id;
    const department = await prisma.department.create({
      data: {
        organizationId,
        departmentCode: `D-${suffix}`,
        departmentName: `Department ${suffix}`,
        status: "Active",
      },
    });
    const user = await prisma.user.create({
      data: {
        organizationId,
        departmentId: department.id,
        firstName: "Organization",
        username: `org-user-${suffix}`,
        email: `org-user-${suffix}@test.invalid`,
        passwordHash: "test-only-password-hash",
        status: "Active",
      },
    });
    userId = user.id;

    const otherOrganization = await prisma.organization.create({
      data: {
        organizationCode: `OTHER-${suffix}`,
        organizationName: `Other Organization ${suffix}`,
        status: "Active",
      },
    });
    otherOrganizationId = otherOrganization.id;
    const otherDepartment = await prisma.department.create({
      data: {
        organizationId: otherOrganizationId,
        departmentCode: `OD-${suffix}`,
        departmentName: `Other Department ${suffix}`,
        status: "Active",
      },
    });
    const otherUser = await prisma.user.create({
      data: {
        organizationId: otherOrganizationId,
        departmentId: otherDepartment.id,
        firstName: "Other",
        username: `other-user-${suffix}`,
        email: `other-user-${suffix}@test.invalid`,
        passwordHash: "test-only-password-hash",
        status: "Active",
      },
    });
    otherUserId = otherUser.id;
  });

  afterAll(async () => {
    if (!organizationId || !otherOrganizationId) {
      await prisma.$disconnect();
      return;
    }
    await prisma.activityLog.deleteMany({
      where: { organizationId: { in: [organizationId, otherOrganizationId] } },
    });
    await prisma.organization.updateMany({
      where: { id: { in: [organizationId, otherOrganizationId] } },
      data: { createdById: null, updatedById: null },
    });
    await prisma.user.deleteMany({
      where: { organizationId: { in: [organizationId, otherOrganizationId] } },
    });
    await prisma.department.deleteMany({
      where: { organizationId: { in: [organizationId, otherOrganizationId] } },
    });
    await prisma.organization.deleteMany({
      where: { id: { in: [organizationId, otherOrganizationId] } },
    });
    if (cityId) {
      await prisma.city.deleteMany({ where: { id: cityId } });
    }
    if (stateId && otherStateId) {
      await prisma.state.deleteMany({
        where: { id: { in: [stateId, otherStateId] } },
      });
    }
    if (countryId && otherCountryId) {
      await prisma.country.deleteMany({
        where: { id: { in: [countryId, otherCountryId] } },
      });
    }
    await prisma.$disconnect();
  });

  it("reads and updates only the selected tenant organization", async () => {
    await expect(repository.findCurrent(organizationId)).resolves.toMatchObject({
      id: organizationId,
      organizationCode: `ORG-${suffix}`,
    });
    const result = await repository.updateCurrent(
      {
        organizationId,
        updatedById: userId,
        changes: { legalName: `Legal Organization ${suffix}` },
      },
      async () => undefined,
    );

    expect(result).toMatchObject({
      kind: "updated",
      organization: {
        id: organizationId,
        legalName: `Legal Organization ${suffix}`,
        updatedById: userId,
      },
    });
    await expect(repository.findCurrent(otherOrganizationId)).resolves.toMatchObject({
      id: otherOrganizationId,
      legalName: null,
    });
  });

  it("accepts a coherent City, State, and Country hierarchy", async () => {
    const result = await repository.updateCurrent(
      {
        organizationId,
        updatedById: userId,
        changes: { cityId, stateId, countryId },
      },
      async () => undefined,
    );

    expect(result).toMatchObject({
      kind: "updated",
      organization: { cityId, stateId, countryId },
    });
  });

  it("rejects incoherent City/State and State/Country pairs", async () => {
    await expect(
      repository.updateCurrent(
        {
          organizationId,
          updatedById: userId,
          changes: { cityId, stateId: otherStateId, countryId: otherCountryId },
        },
        async () => undefined,
      ),
    ).resolves.toEqual({ kind: "invalid-geography" });
    await expect(
      repository.updateCurrent(
        {
          organizationId,
          updatedById: userId,
          changes: { cityId: null, stateId, countryId: otherCountryId },
        },
        async () => undefined,
      ),
    ).resolves.toEqual({ kind: "invalid-geography" });
  });

  it("rejects an updater from another tenant at the database boundary", async () => {
    await expect(
      repository.updateCurrent(
        {
          organizationId,
          updatedById: otherUserId,
          changes: { phone: "0000000000" },
        },
        async () => undefined,
      ),
    ).rejects.toMatchObject({ code: "P2003" });
  });

  it("maps duplicate organization names to a generic conflict", async () => {
    await expect(
      repository.updateCurrent(
        {
          organizationId,
          updatedById: userId,
          changes: { organizationName: `Other Organization ${suffix}` },
        },
        async () => undefined,
      ),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("rolls back the mutation and partial audit when auditing fails", async () => {
    const before = await prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: { phone: true },
    });

    await expect(
      repository.updateCurrent(
        {
          organizationId,
          updatedById: userId,
          changes: { phone: "1111111111" },
        },
        async (record, transaction) => {
          await audit.recordActivity(
            {
              userId,
              organizationId,
              module: "Administration",
              entityName: "Organization",
              recordId: record.id,
              action: "OrganizationUpdated",
            },
            transaction,
          );
          throw new Error("Forced organization audit failure.");
        },
      ),
    ).rejects.toThrow("Forced organization audit failure.");

    await expect(
      prisma.organization.findUniqueOrThrow({
        where: { id: organizationId },
        select: { phone: true },
      }),
    ).resolves.toEqual(before);
    await expect(
      prisma.activityLog.count({
        where: { organizationId, action: "OrganizationUpdated" },
      }),
    ).resolves.toBe(0);
  });

  it("commits a valid mutation with exactly one audit record", async () => {
    const result = await repository.updateCurrent(
      {
        organizationId,
        updatedById: userId,
        changes: { phone: "2222222222" },
      },
      async (record, transaction) => {
        await audit.recordActivity(
          {
            userId,
            organizationId,
            module: "Administration",
            entityName: "Organization",
            recordId: record.id,
            action: "OrganizationUpdated",
          },
          transaction,
        );
      },
    );

    expect(result).toMatchObject({
      kind: "updated",
      organization: { phone: "2222222222" },
    });
    await expect(
      prisma.activityLog.count({
        where: { organizationId, action: "OrganizationUpdated" },
      }),
    ).resolves.toBe(1);
  });
});
