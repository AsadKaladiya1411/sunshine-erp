import {
  auditService,
  type AuditService,
} from "../../../core/audit/audit.service.js";
import { SECURITY_ACTIVITY_ACTIONS } from "../../../core/audit/activity-log.types.js";
import {
  passwordService,
  type PasswordService,
} from "../../../core/auth/password.service.js";
import {
  authorizationAdministrationService,
  type AuthorizationAdministrationService,
} from "../../authorization/services/authorization-administration.service.js";
import {
  INITIAL_ADMINISTRATION_PERMISSION,
  INITIAL_ADMINISTRATOR_ROLE,
  type FirstTenantBootstrapInput,
  type FirstTenantBootstrapResult,
} from "../bootstrap.types.js";
import { BootstrapValidationError } from "../bootstrap.errors.js";
import {
  bootstrapRepository,
  type BootstrapRepository,
} from "../repositories/bootstrap.repository.js";
import { firstTenantBootstrapSchema } from "../validation/bootstrap.schemas.js";

export class BootstrapService {
  constructor(
    private readonly repository: BootstrapRepository = bootstrapRepository,
    private readonly passwords: PasswordService = passwordService,
    private readonly authorization: AuthorizationAdministrationService = authorizationAdministrationService,
    private readonly audit: AuditService = auditService,
  ) {}

  async bootstrapFirstTenant(
    input: FirstTenantBootstrapInput,
  ): Promise<FirstTenantBootstrapResult> {
    const parsed = firstTenantBootstrapSchema.safeParse(input);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const field = issue?.path[0];
      throw new BootstrapValidationError(
        `${typeof field === "string" ? field : "input"}: ${issue?.message ?? "Invalid value."}`,
      );
    }

    const passwordHash = await this.passwords.hash(parsed.data.password);

    return this.repository.runExclusive(async (transaction) => {
      const organization = await this.repository.createOrganization(
        {
          organizationCode: parsed.data.organizationCode,
          organizationName: parsed.data.organizationName,
        },
        transaction,
      );
      const department = await this.repository.createDepartment(
        {
          organizationId: organization.id,
          departmentCode: parsed.data.departmentCode,
          departmentName: parsed.data.departmentName,
        },
        transaction,
      );
      const administrator = await this.repository.createAdministrator(
        {
          organizationId: organization.id,
          departmentId: department.id,
          firstName: parsed.data.administratorFirstName,
          lastName: parsed.data.administratorLastName,
          username: parsed.data.administratorUsername,
          email: parsed.data.administratorEmail,
          passwordHash,
        },
        transaction,
      );

      await this.audit.recordActivity(
        {
          userId: administrator.id,
          organizationId: organization.id,
          module: "Administration",
          entityName: "Organization",
          recordId: organization.id,
          action: SECURITY_ACTIVITY_ACTIONS.bootstrapOrganizationCreated,
          remarks:
            "First tenant organization created during one-time bootstrap.",
        },
        transaction,
      );
      await this.audit.recordActivity(
        {
          userId: administrator.id,
          organizationId: organization.id,
          module: "Administration",
          entityName: "Department",
          recordId: department.id,
          action: SECURITY_ACTIVITY_ACTIONS.bootstrapDepartmentCreated,
          remarks:
            "Required first-user department created during one-time bootstrap.",
        },
        transaction,
      );
      await this.audit.recordActivity(
        {
          userId: administrator.id,
          organizationId: organization.id,
          module: "Administration",
          entityName: "User",
          recordId: administrator.id,
          action: SECURITY_ACTIVITY_ACTIONS.bootstrapAdministratorCreated,
          remarks:
            "First tenant administrator created during one-time bootstrap.",
        },
        transaction,
      );

      const authorization =
        await this.authorization.provisionInitialAdministration(
          {
            organizationId: organization.id,
            administratorUserId: administrator.id,
            roleCode: INITIAL_ADMINISTRATOR_ROLE.code,
            roleName: INITIAL_ADMINISTRATOR_ROLE.name,
            roleDescription: INITIAL_ADMINISTRATOR_ROLE.description,
            permissionCode: INITIAL_ADMINISTRATION_PERMISSION.code,
            permissionName: INITIAL_ADMINISTRATION_PERMISSION.name,
            permissionModule: INITIAL_ADMINISTRATION_PERMISSION.module,
            permissionResource: INITIAL_ADMINISTRATION_PERMISSION.resource,
            permissionAction: INITIAL_ADMINISTRATION_PERMISSION.action,
            permissionDescription:
              INITIAL_ADMINISTRATION_PERMISSION.description,
          },
          transaction,
        );

      return Object.freeze({
        organizationId: organization.id,
        departmentId: department.id,
        administratorUserId: administrator.id,
        ...authorization,
      });
    });
  }
}

export const bootstrapService = new BootstrapService();
