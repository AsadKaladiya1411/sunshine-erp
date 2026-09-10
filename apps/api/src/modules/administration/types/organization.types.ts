import type { ActivityRequestMetadata } from "../../../core/audit/activity-log.types.js";

export const ORGANIZATION_MANAGEMENT_PERMISSION =
  "administration.manage" as const;

export interface OrganizationRecord {
  readonly id: string;
  readonly organizationCode: string;
  readonly organizationName: string;
  readonly legalName: string | null;
  readonly gstNumber: string | null;
  readonly panNumber: string | null;
  readonly email: string | null;
  readonly phone: string | null;
  readonly website: string | null;
  readonly address: string | null;
  readonly cityId: string | null;
  readonly stateId: string | null;
  readonly countryId: string | null;
  readonly pincode: string | null;
  readonly status: string;
  readonly createdById: string | null;
  readonly createdAt: Date;
  readonly updatedById: string | null;
  readonly updatedAt: Date;
}

export interface OrganizationUpdateFields {
  readonly organizationName?: string;
  readonly legalName?: string | null;
  readonly gstNumber?: string | null;
  readonly panNumber?: string | null;
  readonly email?: string | null;
  readonly phone?: string | null;
  readonly website?: string | null;
  readonly address?: string | null;
  readonly cityId?: string | null;
  readonly stateId?: string | null;
  readonly countryId?: string | null;
  readonly pincode?: string | null;
}

export interface UpdateCurrentOrganizationInput
  extends ActivityRequestMetadata {
  readonly organizationId: string;
  readonly updatedById: string;
  readonly changes: OrganizationUpdateFields;
}
