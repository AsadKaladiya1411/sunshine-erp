import { Buffer } from "node:buffer";

export const BCRYPT_PASSWORD_MAX_BYTES = 72;
export const BCRYPT_PASSWORD_MAX_BYTES_MESSAGE =
  `Password must not exceed ${BCRYPT_PASSWORD_MAX_BYTES} UTF-8 bytes.`;

export function getPasswordUtf8ByteLength(password: string): number {
  return Buffer.byteLength(password, "utf8");
}

export function isWithinBcryptPasswordBoundary(password: string): boolean {
  return getPasswordUtf8ByteLength(password) <= BCRYPT_PASSWORD_MAX_BYTES;
}
