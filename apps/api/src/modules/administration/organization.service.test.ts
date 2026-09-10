import { describe, expect, it, jest } from "@jest/globals";
import type { AuditService } from "../../core/audit/audit.service.js";
import { NotFoundError, ValidationError } from "../../core/http/errors.js";
import type { Prisma } from "../../generated/prisma/client.js";
import type {
  OrganizationRepository,
  UpdateOrganizationRepositoryResult,
} from "./repositories/organization.repository.js";
import type { OrganizationRecord } from "./types/organization.types.js";
import { OrganizationService } from "./services/organization.service.js";

const organization: OrganizationRecord = Object.freeze({
  id: "11111111-1111-4111-8111-111111111111",
  organizationCode: "SUN",
  organizationName: "Sunshine Corporation",
  legalName: null,
  gstNumber: null,
  panNumber: null,
  email: null,
  phone: null,
  website: null,
  address: null,
  cityId: null,
  stateId: null,
  countryId: null,
  pincode: null,
  status: "Active",
  createdById: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedById: null,
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
});

function createService(result: UpdateOrganizationRepositoryResult) {
  const findCurrent = jest.fn<OrganizationRepository["findCurrent"]>();
  const updateCurrent = jest.fn<OrganizationRepository["updateCurrent"]>(
    async (_input, hook) => {
      if (result.kind === "updated") {
        await hook(
          result.organization,
          {} as Prisma.TransactionClient,
        );
      }
      return result;
    },
  );
  const recordActivity = jest.fn<AuditService["recordActivity"]>(async () => ({
    id: "22222222-2222-4222-8222-222222222222",
    userId: "33333333-3333-4333-8333-333333333333",
    organizationId: organization.id,
    module: "Administration",
    entityName: "Organization",
    recordId: organization.id,
    action: "OrganizationUpdated",
    ipAddress: null,
    userAgent: null,
    deviceInfo: null,
    performedAt: new Date(),
    remarks: null,
  }));
  const repository = { findCurrent, updateCurrent } as unknown as OrganizationRepository;
  const audit = { recordActivity } as unknown as AuditService;
  return {
    service: new OrganizationService(repository, audit),
    findCurrent,
    updateCurrent,
    recordActivity,
  };
}

describe("OrganizationService", () => {
  it("reads only the organization supplied by authenticated context", async () => {
    const test = createService({ kind: "updated", organization });
    test.findCurrent.mockResolvedValue(organization);

    await expect(
      test.service.getCurrentOrganization(organization.id),
    ).resolves.toBe(organization);
    expect(test.findCurrent).toHaveBeenCalledWith(organization.id);
  });

  it("passes only approved changes and the authenticated updater to persistence and audit", async () => {
    const test = createService({ kind: "updated", organization });
    const updatedById = "33333333-3333-4333-8333-333333333333";

    await test.service.updateCurrentOrganization({
      organizationId: organization.id,
      updatedById,
      changes: { legalName: "Sunshine Corporation Private Limited" },
      ipAddress: "127.0.0.1",
      userAgent: "Organization-Service-Test/1.0",
    });

    expect(test.updateCurrent).toHaveBeenCalledWith(
      {
        organizationId: organization.id,
        updatedById,
        changes: { legalName: "Sunshine Corporation Private Limited" },
      },
      expect.any(Function),
    );
    expect(test.recordActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: updatedById,
        organizationId: organization.id,
        module: "Administration",
        entityName: "Organization",
        recordId: organization.id,
        action: "OrganizationUpdated",
        ipAddress: "127.0.0.1",
      }),
      expect.any(Object),
    );
  });

  it("reports a missing current organization", async () => {
    const test = createService({ kind: "not-found" });
    test.findCurrent.mockResolvedValue(null);

    await expect(
      test.service.getCurrentOrganization(organization.id),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      test.service.updateCurrentOrganization({
        organizationId: organization.id,
        updatedById: "33333333-3333-4333-8333-333333333333",
        changes: { organizationName: "Updated" },
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("interprets an incoherent geography as request validation failure", async () => {
    const test = createService({ kind: "invalid-geography" });

    await expect(
      test.service.updateCurrentOrganization({
        organizationId: organization.id,
        updatedById: "33333333-3333-4333-8333-333333333333",
        changes: { stateId: null },
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(test.recordActivity).not.toHaveBeenCalled();
  });
});
