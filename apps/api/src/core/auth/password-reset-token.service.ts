import { createHash, randomBytes } from "node:crypto";
import { env } from "@sunshine-erp/config";

export interface PasswordResetCredential {
  readonly token: string;
  readonly tokenHash: string;
  readonly expiresAt: Date;
}

export class PasswordResetTokenService {
  constructor(
    private readonly lifetimeSeconds =
      env.PASSWORD_RESET_TOKEN_LIFETIME_SECONDS,
  ) {}

  generate(now = new Date()): PasswordResetCredential {
    const token = randomBytes(32).toString("base64url");

    return Object.freeze({
      token,
      tokenHash: this.digest(token),
      expiresAt: new Date(now.getTime() + this.lifetimeSeconds * 1_000),
    });
  }

  digest(token: string): string {
    return createHash("sha256").update(token, "utf8").digest("hex");
  }
}

export const passwordResetTokenService = new PasswordResetTokenService();
