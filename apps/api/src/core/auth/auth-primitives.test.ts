import { randomUUID } from "node:crypto";
import { describe, expect, it } from "@jest/globals";
import { AccessTokenService } from "./access-token.service.js";
import { PasswordResetTokenService } from "./password-reset-token.service.js";
import {
  BCRYPT_PASSWORD_MAX_BYTES,
  getPasswordUtf8ByteLength,
} from "./password-boundary.js";
import { PasswordService } from "./password.service.js";
import { RefreshTokenService } from "./refresh-token.service.js";

describe("authentication security primitives", () => {
  it("hashes passwords with bcrypt and enforces length and history", async () => {
    const passwords = new PasswordService({
      minimumLength: 12,
      bcryptCost: 4,
      historyDepth: 5,
    });
    const hash = await passwords.hash("correct-horse-battery");

    expect(hash).toMatch(/^\$2[aby]\$04\$/);
    await expect(
      passwords.verify("correct-horse-battery", hash),
    ).resolves.toBe(true);
    await expect(passwords.hash("too-short")).rejects.toMatchObject({
      code: "PASSWORD_POLICY_VIOLATION",
    });
    await expect(
      passwords.assertNotReused("correct-horse-battery", hash, []),
    ).rejects.toMatchObject({ code: "PASSWORD_POLICY_VIOLATION" });
  });

  it("enforces bcrypt's UTF-8 byte boundary without accepting truncated matches", async () => {
    const passwords = new PasswordService({
      minimumLength: 12,
      bcryptCost: 4,
      historyDepth: 5,
    });
    const supportedPassword = "a".repeat(BCRYPT_PASSWORD_MAX_BYTES);
    const oversizedPassword = `${supportedPassword}b`;
    const supportedUnicodePassword = "€".repeat(
      BCRYPT_PASSWORD_MAX_BYTES / 3,
    );
    const oversizedUnicodePassword = `${supportedUnicodePassword}€`;

    expect(getPasswordUtf8ByteLength(supportedPassword)).toBe(72);
    expect(getPasswordUtf8ByteLength(supportedUnicodePassword)).toBe(72);

    const hash = await passwords.hash(supportedPassword);
    const unicodeHash = await passwords.hash(supportedUnicodePassword);

    await expect(passwords.verify(supportedPassword, hash)).resolves.toBe(true);
    await expect(
      passwords.verify(supportedUnicodePassword, unicodeHash),
    ).resolves.toBe(true);
    await expect(passwords.verify(oversizedPassword, hash)).resolves.toBe(
      false,
    );
    await expect(
      passwords.hash(oversizedPassword),
    ).rejects.toMatchObject({ code: "PASSWORD_POLICY_VIOLATION" });
    await expect(
      passwords.hash(oversizedUnicodePassword),
    ).rejects.toMatchObject({ code: "PASSWORD_POLICY_VIOLATION" });
  });

  it("signs and verifies explicitly scoped short-lived access tokens", async () => {
    const tokens = new AccessTokenService({
      issuer: "sunshine-test",
      audience: "sunshine-api-test",
      secret: "unit-test-secret-with-more-than-thirty-two-characters",
      algorithm: "HS256",
      lifetimeSeconds: 900,
    });
    const identity = {
      userId: randomUUID(),
      organizationId: randomUUID(),
      sessionId: randomUUID(),
    };
    const token = await tokens.sign(identity);

    await expect(tokens.verify(token)).resolves.toEqual(identity);
    expect(tokens.lifetimeSeconds).toBe(900);
    await expect(tokens.verify(`${token}invalid`)).rejects.toMatchObject({
      code: "AUTHENTICATION_ERROR",
    });
  });

  it("generates opaque refresh tokens and stores only a keyed digest", () => {
    const tokens = new RefreshTokenService({
      digestSecret:
        "unit-test-refresh-secret-with-more-than-thirty-two-characters",
      lifetimeSeconds: 604_800,
      randomBytes: 32,
    });
    const now = new Date("2026-08-25T12:00:00.000Z");
    const credential = tokens.generate(now);

    expect(credential.token).not.toBe(credential.tokenHash);
    expect(credential.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(tokens.matches(credential.token, credential.tokenHash)).toBe(true);
    expect(tokens.matches("different-token", credential.tokenHash)).toBe(false);
    expect(credential.expiresAt.toISOString()).toBe("2026-09-01T12:00:00.000Z");
  });

  it("generates single-use password reset credentials with hashed persistence", () => {
    const tokens = new PasswordResetTokenService(1_800);
    const now = new Date("2026-08-25T12:00:00.000Z");
    const credential = tokens.generate(now);

    expect(credential.token).not.toBe(credential.tokenHash);
    expect(credential.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(tokens.digest(credential.token)).toBe(credential.tokenHash);
    expect(credential.expiresAt.toISOString()).toBe("2026-08-25T12:30:00.000Z");
  });
});
