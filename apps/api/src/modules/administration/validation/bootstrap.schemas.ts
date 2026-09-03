import { z } from "zod";

const requiredTrimmedString = (maximumLength: number) =>
  z.string().trim().min(1).max(maximumLength);

export const firstTenantBootstrapSchema = z
  .object({
    organizationCode: requiredTrimmedString(50),
    organizationName: requiredTrimmedString(150),
    departmentCode: requiredTrimmedString(50),
    departmentName: requiredTrimmedString(150),
    administratorFirstName: requiredTrimmedString(100),
    administratorLastName: requiredTrimmedString(100).optional(),
    administratorUsername: requiredTrimmedString(100),
    administratorEmail: z.string().trim().email().max(150),
    password: z.string().min(1),
  })
  .strict();
