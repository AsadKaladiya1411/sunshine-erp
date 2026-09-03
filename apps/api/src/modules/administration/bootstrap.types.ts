export const INITIAL_ADMINISTRATOR_ROLE = Object.freeze({
  code: "ADMINISTRATOR",
  name: "Administrator",
  description: "Initial tenant administrator role.",
});

export const INITIAL_ADMINISTRATION_PERMISSION = Object.freeze({
  code: "administration.manage",
  name: "Manage administration",
  module: "Administration",
  resource: "administration",
  action: "manage",
  description: "Manage tenant administration configuration and access.",
});

export interface FirstTenantBootstrapInput {
  readonly organizationCode: string;
  readonly organizationName: string;
  readonly departmentCode: string;
  readonly departmentName: string;
  readonly administratorFirstName: string;
  readonly administratorLastName?: string;
  readonly administratorUsername: string;
  readonly administratorEmail: string;
  readonly password: string;
}

export interface FirstTenantBootstrapResult {
  readonly organizationId: string;
  readonly departmentId: string;
  readonly administratorUserId: string;
  readonly roleId: string;
  readonly permissionId: string;
  readonly rolePermissionId: string;
  readonly roleAssignmentId: string;
}
