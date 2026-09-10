import { prisma } from "../../../core/database/prisma.js";
import { ConflictError } from "../../../core/http/errors.js";
import {
  Prisma,
  type PrismaClient,
} from "../../../generated/prisma/client.js";
import type {
  OrganizationRecord,
  OrganizationUpdateFields,
} from "../types/organization.types.js";

export interface UpdateOrganizationRepositoryInput {
  readonly organizationId: string;
  readonly updatedById: string;
  readonly changes: OrganizationUpdateFields;
}

export type OrganizationMutationHook = (
  organization: OrganizationRecord,
  transaction: Prisma.TransactionClient,
) => Promise<void>;

export type UpdateOrganizationRepositoryResult =
  | {
      readonly kind: "updated";
      readonly organization: OrganizationRecord;
    }
  | { readonly kind: "not-found" }
  | { readonly kind: "invalid-geography" };

const organizationSelection = {
  id: true,
  organizationCode: true,
  organizationName: true,
  legalName: true,
  gstNumber: true,
  panNumber: true,
  email: true,
  phone: true,
  website: true,
  address: true,
  cityId: true,
  stateId: true,
  countryId: true,
  pincode: true,
  status: true,
  createdById: true,
  createdAt: true,
  updatedById: true,
  updatedAt: true,
} as const;

function mapOrganization(record: OrganizationRecord): OrganizationRecord {
  return Object.freeze({ ...record });
}

function changedValue<T>(current: T, proposed: T | undefined): T {
  return proposed === undefined ? current : proposed;
}

export class OrganizationRepository {
  constructor(private readonly database: PrismaClient = prisma) {}

  async findCurrent(
    organizationId: string,
  ): Promise<OrganizationRecord | null> {
    const organization = await this.database.organization.findFirst({
      where: { id: organizationId },
      select: organizationSelection,
    });
    return organization ? mapOrganization(organization) : null;
  }

  async updateCurrent(
    input: UpdateOrganizationRepositoryInput,
    afterUpdate: OrganizationMutationHook,
  ): Promise<UpdateOrganizationRepositoryResult> {
    try {
      return await this.database.$transaction(async (transaction) => {
        const current = await transaction.organization.findFirst({
          where: { id: input.organizationId },
          select: organizationSelection,
        });
        if (!current) {
          return { kind: "not-found" };
        }

        const cityId = changedValue(current.cityId, input.changes.cityId);
        const stateId = changedValue(current.stateId, input.changes.stateId);
        const countryId = changedValue(
          current.countryId,
          input.changes.countryId,
        );
        if (
          !(await this.isValidGeography(
            transaction,
            cityId,
            stateId,
            countryId,
          ))
        ) {
          return { kind: "invalid-geography" };
        }

        const organization = await transaction.organization.update({
          where: { id: input.organizationId },
          data: {
            organizationName: input.changes.organizationName,
            legalName: input.changes.legalName,
            gstNumber: input.changes.gstNumber,
            panNumber: input.changes.panNumber,
            email: input.changes.email,
            phone: input.changes.phone,
            website: input.changes.website,
            address: input.changes.address,
            cityId: input.changes.cityId,
            stateId: input.changes.stateId,
            countryId: input.changes.countryId,
            pincode: input.changes.pincode,
            updatedById: input.updatedById,
          },
          select: organizationSelection,
        });
        const mappedOrganization = mapOrganization(organization);
        await afterUpdate(mappedOrganization, transaction);
        return { kind: "updated", organization: mappedOrganization };
      });
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new ConflictError(
          "Organization details conflict with an existing record.",
        );
      }
      throw error;
    }
  }

  private async isValidGeography(
    transaction: Prisma.TransactionClient,
    cityId: string | null,
    stateId: string | null,
    countryId: string | null,
  ): Promise<boolean> {
    if (
      (cityId !== null && stateId === null) ||
      (stateId !== null && countryId === null)
    ) {
      return false;
    }

    if (countryId !== null) {
      const country = await transaction.country.findUnique({
        where: { id: countryId },
        select: { id: true },
      });
      if (!country) {
        return false;
      }
    }

    if (stateId !== null) {
      const state = await transaction.state.findFirst({
        where: { id: stateId, countryId: countryId ?? undefined },
        select: { id: true },
      });
      if (!state) {
        return false;
      }
    }

    if (cityId !== null) {
      const city = await transaction.city.findFirst({
        where: { id: cityId, stateId: stateId ?? undefined },
        select: { id: true },
      });
      if (!city) {
        return false;
      }
    }

    return true;
  }
}

export const organizationRepository = new OrganizationRepository();
