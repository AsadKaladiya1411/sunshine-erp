import bcrypt from "bcrypt";
import { env } from "@sunshine-erp/config";
import { PasswordPolicyError } from "../http/errors.js";

export interface PasswordServiceOptions {
  readonly minimumLength: number;
  readonly bcryptCost: number;
  readonly historyDepth: number;
}

export class PasswordService {
  constructor(
    private readonly options: PasswordServiceOptions = {
      minimumLength: env.PASSWORD_MIN_LENGTH,
      bcryptCost: env.BCRYPT_COST,
      historyDepth: env.PASSWORD_HISTORY_DEPTH,
    },
  ) {}

  validate(password: string): void {
    if (password.length < this.options.minimumLength) {
      throw new PasswordPolicyError(
        `Password must contain at least ${this.options.minimumLength} characters.`,
      );
    }
  }

  async hash(password: string): Promise<string> {
    this.validate(password);
    return bcrypt.hash(password, this.options.bcryptCost);
  }

  verify(password: string, passwordHash: string): Promise<boolean> {
    return bcrypt.compare(password, passwordHash);
  }

  async assertNotReused(
    password: string,
    currentPasswordHash: string,
    historicalPasswordHashes: readonly string[],
  ): Promise<void> {
    this.validate(password);

    const hashesToCheck = [
      currentPasswordHash,
      ...historicalPasswordHashes.slice(0, this.options.historyDepth),
    ];

    for (const passwordHash of hashesToCheck) {
      if (await this.verify(password, passwordHash)) {
        throw new PasswordPolicyError(
          `Password must not match the current password or the last ${this.options.historyDepth} passwords.`,
        );
      }
    }
  }
}

export const passwordService = new PasswordService();
