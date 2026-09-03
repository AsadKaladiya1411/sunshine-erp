import { createInterface } from "node:readline/promises";
import { resolve } from "node:path";
import { Writable } from "node:stream";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { prisma } from "../../../core/database/prisma.js";
import { PasswordPolicyError } from "../../../core/http/errors.js";
import {
  BootstrapNotAllowedError,
  BootstrapSecretInputError,
  BootstrapValidationError,
} from "../bootstrap.errors.js";
import { bootstrapService } from "../services/bootstrap.service.js";

export interface BootstrapCliArguments {
  readonly organizationCode: string;
  readonly organizationName: string;
  readonly departmentCode: string;
  readonly departmentName: string;
  readonly administratorFirstName: string;
  readonly administratorLastName?: string;
  readonly administratorUsername: string;
  readonly administratorEmail: string;
  readonly passwordStdin: boolean;
}

function requiredOption(value: string | undefined, optionName: string): string {
  if (!value) {
    throw new BootstrapValidationError(`${optionName} is required.`);
  }
  return value;
}

export function parseBootstrapCliArguments(
  arguments_: readonly string[],
): BootstrapCliArguments {
  if (
    arguments_.some((argument) =>
      /^--(?:administrator-|admin-)?password(?:=|$)/i.test(argument),
    )
  ) {
    throw new BootstrapSecretInputError(
      "Do not provide passwords as command-line arguments.",
    );
  }

  const { values } = parseArgs({
    args: [...arguments_],
    strict: true,
    allowPositionals: false,
    options: {
      "organization-code": { type: "string" },
      "organization-name": { type: "string" },
      "department-code": { type: "string" },
      "department-name": { type: "string" },
      "admin-first-name": { type: "string" },
      "admin-last-name": { type: "string" },
      "admin-username": { type: "string" },
      "admin-email": { type: "string" },
      "password-stdin": { type: "boolean", default: false },
    },
  });

  return Object.freeze({
    organizationCode: requiredOption(
      values["organization-code"],
      "--organization-code",
    ),
    organizationName: requiredOption(
      values["organization-name"],
      "--organization-name",
    ),
    departmentCode: requiredOption(
      values["department-code"],
      "--department-code",
    ),
    departmentName: requiredOption(
      values["department-name"],
      "--department-name",
    ),
    administratorFirstName: requiredOption(
      values["admin-first-name"],
      "--admin-first-name",
    ),
    administratorLastName: values["admin-last-name"],
    administratorUsername: requiredOption(
      values["admin-username"],
      "--admin-username",
    ),
    administratorEmail: requiredOption(values["admin-email"], "--admin-email"),
    passwordStdin: values["password-stdin"] ?? false,
  });
}

async function readHiddenPassword(
  prompt: string,
  input: NodeJS.ReadStream,
  output: NodeJS.WriteStream,
): Promise<string> {
  if (!input.isTTY || !output.isTTY) {
    throw new BootstrapSecretInputError(
      "Interactive password input requires a terminal. Use --password-stdin for protected redirected input.",
    );
  }

  let muted = false;
  const hiddenOutput = new Writable({
    write(chunk, encoding, callback) {
      if (!muted) {
        output.write(chunk, encoding);
      }
      callback();
    },
  });
  const reader = createInterface({
    input,
    output: hiddenOutput,
    terminal: true,
  });

  output.write(prompt);
  muted = true;
  try {
    return await reader.question("");
  } finally {
    muted = false;
    reader.close();
    output.write("\n");
  }
}

async function readRedirectedPassword(
  input: NodeJS.ReadStream,
): Promise<string> {
  if (input.isTTY) {
    throw new BootstrapSecretInputError(
      "--password-stdin requires redirected standard input.",
    );
  }

  const reader = createInterface({ input, crlfDelay: Infinity });
  try {
    for await (const line of reader) {
      if (line.length > 0) {
        return line;
      }
      break;
    }
  } finally {
    reader.close();
  }
  throw new BootstrapSecretInputError();
}

export async function readBootstrapPassword(
  passwordStdin: boolean,
  input: NodeJS.ReadStream = process.stdin,
  output: NodeJS.WriteStream = process.stderr,
): Promise<string> {
  if (passwordStdin) {
    return readRedirectedPassword(input);
  }

  const password = await readHiddenPassword(
    "Administrator password: ",
    input,
    output,
  );
  const confirmation = await readHiddenPassword(
    "Confirm administrator password: ",
    input,
    output,
  );
  if (password !== confirmation) {
    throw new BootstrapSecretInputError(
      "Password confirmation does not match.",
    );
  }
  return password;
}

export function getSafeBootstrapErrorMessage(error: unknown): string {
  if (
    error instanceof BootstrapValidationError ||
    error instanceof BootstrapNotAllowedError ||
    error instanceof BootstrapSecretInputError ||
    error instanceof PasswordPolicyError
  ) {
    return error.message;
  }
  return "Bootstrap failed safely. No bootstrap data was committed.";
}

export async function runBootstrapCli(
  arguments_: readonly string[] = process.argv.slice(2),
): Promise<void> {
  const input = parseBootstrapCliArguments(arguments_);
  const password = await readBootstrapPassword(input.passwordStdin);
  await bootstrapService.bootstrapFirstTenant({
    organizationCode: input.organizationCode,
    organizationName: input.organizationName,
    departmentCode: input.departmentCode,
    departmentName: input.departmentName,
    administratorFirstName: input.administratorFirstName,
    administratorLastName: input.administratorLastName,
    administratorUsername: input.administratorUsername,
    administratorEmail: input.administratorEmail,
    password,
  });
  process.stdout.write("First tenant bootstrap completed successfully.\n");
}

if (
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  void runBootstrapCli()
    .catch((error: unknown) => {
      process.stderr.write(`${getSafeBootstrapErrorMessage(error)}\n`);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
