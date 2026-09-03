import { describe, expect, it } from "@jest/globals";
import { BootstrapSecretInputError } from "../bootstrap.errors.js";
import {
  getSafeBootstrapErrorMessage,
  parseBootstrapCliArguments,
} from "./bootstrap-first-tenant.js";

const requiredArguments = [
  "--organization-code=SUNSHINE",
  "--organization-name=Sunshine Corporation",
  "--department-code=ADMIN",
  "--department-name=Administration",
  "--admin-first-name=First",
  "--admin-username=admin",
  "--admin-email=admin@example.com",
] as const;

describe("first-tenant bootstrap CLI", () => {
  it("parses required non-secret identity input", () => {
    expect(parseBootstrapCliArguments(requiredArguments)).toMatchObject({
      organizationCode: "SUNSHINE",
      organizationName: "Sunshine Corporation",
      departmentCode: "ADMIN",
      departmentName: "Administration",
      administratorFirstName: "First",
      administratorUsername: "admin",
      administratorEmail: "admin@example.com",
      passwordStdin: false,
    });
  });

  it("rejects a password command-line argument without echoing its value", () => {
    const secret = "Never-Echo-This-Password";
    let error: unknown;
    try {
      parseBootstrapCliArguments([
        ...requiredArguments,
        `--password=${secret}`,
      ]);
    } catch (caught: unknown) {
      error = caught;
    }
    expect(error).toBeInstanceOf(BootstrapSecretInputError);
    expect(getSafeBootstrapErrorMessage(error)).not.toContain(secret);
  });

  it("masks unexpected failures instead of exposing sensitive details", () => {
    const secret = "database-password=Never-Expose-Me";
    const message = getSafeBootstrapErrorMessage(new Error(secret));
    expect(message).toBe(
      "Bootstrap failed safely. No bootstrap data was committed.",
    );
    expect(message).not.toContain(secret);
  });
});
