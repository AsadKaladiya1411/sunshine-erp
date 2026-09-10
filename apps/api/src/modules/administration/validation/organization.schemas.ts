import { z } from "zod";
import type { RequestValidationSchemas } from "../../../core/middleware/validate-request.middleware.js";

const optionalNullableText = (maximumLength?: number) => {
  const text = z.string().trim().min(1);
  return (maximumLength === undefined ? text : text.max(maximumLength))
    .nullable()
    .optional();
};

const optionalNullableUuid = z.string().uuid().nullable().optional();

export const updateOrganizationBodySchema = z
  .object({
    organizationName: z.string().trim().min(1).max(150).optional(),
    legalName: optionalNullableText(200),
    gstNumber: optionalNullableText(20),
    panNumber: optionalNullableText(20),
    email: z.string().trim().email().max(150).nullable().optional(),
    phone: optionalNullableText(30),
    website: optionalNullableText(200),
    address: optionalNullableText(),
    cityId: optionalNullableUuid,
    stateId: optionalNullableUuid,
    countryId: optionalNullableUuid,
    pincode: optionalNullableText(20),
  })
  .strict()
  .refine((body) => Object.keys(body).length > 0, {
    message: "Provide at least one organization field to update.",
  });

export const updateOrganizationRequestSchemas = {
  body: updateOrganizationBodySchema,
} satisfies RequestValidationSchemas;

export const organizationResponseDataSchema = z.object({
  id: z.string().uuid(),
  organizationCode: z.string().max(50),
  organizationName: z.string().max(150),
  legalName: z.string().max(200).nullable(),
  gstNumber: z.string().max(20).nullable(),
  panNumber: z.string().max(20).nullable(),
  email: z.string().email().max(150).nullable(),
  phone: z.string().max(30).nullable(),
  website: z.string().max(200).nullable(),
  address: z.string().nullable(),
  cityId: z.string().uuid().nullable(),
  stateId: z.string().uuid().nullable(),
  countryId: z.string().uuid().nullable(),
  pincode: z.string().max(20).nullable(),
  status: z.string().max(30),
  createdById: z.string().uuid().nullable(),
  createdAt: z.iso.datetime(),
  updatedById: z.string().uuid().nullable(),
  updatedAt: z.iso.datetime(),
});

export const organizationResponseSchema = z.object({
  success: z.literal(true),
  data: organizationResponseDataSchema,
});
