import { AuditService, auditService } from "../../../core/audit/audit.service.js";
import {
  NotFoundError,
  ValidationError,
} from "../../../core/http/errors.js";
import {
  OrganizationRepository,
  organizationRepository,
} from "../repositories/organization.repository.js";
import type {
  OrganizationRecord,
  UpdateCurrentOrganizationInput,
} from "../types/organization.types.js";

const ORGANIZATION_UPDATED_ACTION = "OrganizationUpdated";

export class OrganizationService {
  constructor(
    private readonly organizations: OrganizationRepository = organizationRepository,
    private readonly audit: AuditService = auditService,
  ) {}

  async getCurrentOrganization(
    organizationId: string,
  ): Promise<OrganizationRecord> {
    const organization = await this.organizations.findCurrent(organizationId);
    if (!organization) {
      throw new NotFoundError("Organization not found.");
    }
    return organization;
  }

  async updateCurrentOrganization(
    input: UpdateCurrentOrganizationInput,
  ): Promise<OrganizationRecord> {
    const result = await this.organizations.updateCurrent(
      {
        organizationId: input.organizationId,
        updatedById: input.updatedById,
        changes: input.changes,
      },
      async (organization, transaction) => {
        await this.audit.recordActivity(
          {
            userId: input.updatedById,
            organizationId: input.organizationId,
            module: "Administration",
            entityName: "Organization",
            recordId: organization.id,
            action: ORGANIZATION_UPDATED_ACTION,
            ipAddress: input.ipAddress,
            userAgent: input.userAgent,
            deviceInfo: input.deviceInfo,
            remarks: "Organization details updated.",
          },
          transaction,
        );
      },
    );

    if (result.kind === "not-found") {
      throw new NotFoundError("Organization not found.");
    }
    if (result.kind === "invalid-geography") {
      throw new ValidationError(
        [
          {
            source: "body",
            path: ["cityId", "stateId", "countryId"],
            message:
              "Organization geography must form a valid City, State, and Country hierarchy.",
          },
        ],
        "Organization geography is invalid.",
      );
    }
    return result.organization;
  }
}

export const organizationService = new OrganizationService();
