import {
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { env } from "@sunshine-erp/config";

export interface RefreshTokenServiceOptions {
  readonly digestSecret: string;
  readonly lifetimeSeconds: number;
  readonly randomBytes: number;
}

export interface RefreshTokenCredential {
  readonly token: string;
  readonly tokenHash: string;
  readonly issuedAt: Date;
  readonly expiresAt: Date;
}

export class RefreshTokenService {
  constructor(
    private readonly options: RefreshTokenServiceOptions = {
      digestSecret: env.REFRESH_TOKEN_DIGEST_SECRET,
      lifetimeSeconds: env.REFRESH_TOKEN_LIFETIME_SECONDS,
      randomBytes: 32,
    },
  ) {}

  generate(now = new Date()): RefreshTokenCredential {
    const token = randomBytes(this.options.randomBytes).toString("base64url");

    return Object.freeze({
      token,
      tokenHash: this.digest(token),
      issuedAt: now,
      expiresAt: new Date(
        now.getTime() + this.options.lifetimeSeconds * 1_000,
      ),
    });
  }

  digest(token: string): string {
    return createHmac("sha256", this.options.digestSecret)
      .update(token, "utf8")
      .digest("hex");
  }

  matches(token: string, expectedHash: string): boolean {
    const actualHash = Buffer.from(this.digest(token), "hex");
    const expected = Buffer.from(expectedHash, "hex");

    return (
      actualHash.length === expected.length &&
      timingSafeEqual(actualHash, expected)
    );
  }

  get lifetimeSeconds(): number {
    return this.options.lifetimeSeconds;
  }
}

export const refreshTokenService = new RefreshTokenService();
