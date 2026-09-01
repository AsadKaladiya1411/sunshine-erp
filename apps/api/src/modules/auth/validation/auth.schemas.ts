import { z } from "zod";
import {
  BCRYPT_PASSWORD_MAX_BYTES_MESSAGE,
  isWithinBcryptPasswordBoundary,
} from "../../../core/auth/password-boundary.js";
import type { RequestValidationSchemas } from "../../../core/middleware/validate-request.middleware.js";

const organizationCode = z.string().trim().min(1).max(50);
const loginIdentifier = z.string().trim().min(1).max(150);
const password = z.string().min(1).refine(isWithinBcryptPasswordBoundary, {
  message: BCRYPT_PASSWORD_MAX_BYTES_MESSAGE,
});

export const loginBodySchema = z
  .object({
    organizationCode,
    username: loginIdentifier.optional(),
    email: z.string().trim().email().max(150).optional(),
    password,
  })
  .strict()
  .refine(
    (input) => Boolean(input.username) !== Boolean(input.email),
    "Provide exactly one of username or email.",
  );

export const loginRequestSchemas = {
  body: loginBodySchema,
} satisfies RequestValidationSchemas;

export const changePasswordBodySchema = z
  .object({
    currentPassword: password,
    newPassword: z
      .string()
      .min(12)
      .max(1_024)
      .refine(isWithinBcryptPasswordBoundary, {
        message: BCRYPT_PASSWORD_MAX_BYTES_MESSAGE,
      }),
  })
  .strict();

export const changePasswordRequestSchemas = {
  body: changePasswordBodySchema,
} satisfies RequestValidationSchemas;
