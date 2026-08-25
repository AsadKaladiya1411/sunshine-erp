import { randomUUID } from "node:crypto";
import { env } from "@sunshine-erp/config";
import { jwtVerify, SignJWT, type JWTPayload } from "jose";
import { AuthenticationError } from "../http/errors.js";

export interface AccessTokenIdentity {
  readonly userId: string;
  readonly organizationId: string;
  readonly sessionId: string;
}

export interface AccessTokenServiceOptions {
  readonly issuer: string;
  readonly audience: string;
  readonly secret: string;
  readonly algorithm: "HS256" | "HS384" | "HS512";
  readonly lifetimeSeconds: number;
}

interface AuthenticatedJwtPayload extends JWTPayload {
  readonly organizationId: string;
  readonly sessionId: string;
}

export class AccessTokenService {
  private readonly key: Uint8Array;

  constructor(
    private readonly options: AccessTokenServiceOptions = {
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE,
      secret: env.JWT_SECRET,
      algorithm: env.JWT_ALGORITHM,
      lifetimeSeconds: env.JWT_ACCESS_TOKEN_LIFETIME_SECONDS,
    },
  ) {
    this.key = new TextEncoder().encode(options.secret);
  }

  async sign(identity: AccessTokenIdentity): Promise<string> {
    const issuedAt = Math.floor(Date.now() / 1_000);

    return new SignJWT({
      organizationId: identity.organizationId,
      sessionId: identity.sessionId,
    })
      .setProtectedHeader({ alg: this.options.algorithm, typ: "JWT" })
      .setSubject(identity.userId)
      .setIssuer(this.options.issuer)
      .setAudience(this.options.audience)
      .setJti(randomUUID())
      .setIssuedAt(issuedAt)
      .setExpirationTime(issuedAt + this.options.lifetimeSeconds)
      .sign(this.key);
  }

  async verify(token: string): Promise<AccessTokenIdentity> {
    try {
      const { payload } = await jwtVerify(token, this.key, {
        algorithms: [this.options.algorithm],
        issuer: this.options.issuer,
        audience: this.options.audience,
      });

      if (
        typeof payload.sub !== "string" ||
        typeof payload.organizationId !== "string" ||
        typeof payload.sessionId !== "string"
      ) {
        throw new AuthenticationError();
      }

      const authenticatedPayload = payload as AuthenticatedJwtPayload;

      return Object.freeze({
        userId: authenticatedPayload.sub as string,
        organizationId: authenticatedPayload.organizationId,
        sessionId: authenticatedPayload.sessionId,
      });
    } catch {
      throw new AuthenticationError();
    }
  }

  get lifetimeSeconds(): number {
    return this.options.lifetimeSeconds;
  }
}

export const accessTokenService = new AccessTokenService();
