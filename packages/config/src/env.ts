import { isIP } from "node:net";
import { z } from "zod";

const developmentJwtSecret =
  "development-only-jwt-secret-change-before-production";
const developmentRefreshDigestSecret =
  "development-only-refresh-digest-secret-change-before-production";

const booleanFromEnvironment = z
  .enum(["true", "false"])
  .transform((value) => value === "true");

interface AddressRange {
  start: bigint;
  end: bigint;
}

const ipv4MappedStart = 0xffffn << 32n;
const ipv4MappedEnd = ipv4MappedStart + (1n << 32n) - 1n;
const ipv6End = (1n << 128n) - 1n;

function parseIpv4Address(address: string): bigint {
  return address
    .split(".")
    .reduce((result, octet) => (result << 8n) + BigInt(octet), 0n);
}

function parseIpv6Address(address: string): bigint {
  let normalized = address;
  if (normalized.includes(".")) {
    const lastColon = normalized.lastIndexOf(":");
    const ipv4 = parseIpv4Address(normalized.slice(lastColon + 1));
    normalized = `${normalized.slice(0, lastColon)}:${(ipv4 >> 16n).toString(16)}:${(ipv4 & 0xffffn).toString(16)}`;
  }

  const halves = normalized.split("::");
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves[1] ? halves[1].split(":") : [];
  const groups = halves.length === 2
    ? [...left, ...Array<string>(8 - left.length - right.length).fill("0"), ...right]
    : left;

  return groups.reduce(
    (result, group) => (result << 16n) + BigInt(`0x${group}`),
    0n,
  );
}

function trustedProxyRange(value: string): AddressRange {
  const [address, prefix] = value.split("/");
  const family = isIP(address!);
  const addressBits = family === 4 ? 32 : 128;
  const prefixBits = prefix === undefined ? addressBits : Number(prefix);
  const hostBits = BigInt(addressBits - prefixBits);
  const addressValue = family === 4
    ? ipv4MappedStart + parseIpv4Address(address!)
    : parseIpv6Address(address!);
  const size = 1n << hostBits;
  const start = (addressValue / size) * size;
  return { start, end: start + size - 1n };
}

function rangesCover(
  ranges: readonly AddressRange[],
  targetStart: bigint,
  targetEnd: bigint,
): boolean {
  const relevant = ranges
    .filter((range) => range.end >= targetStart && range.start <= targetEnd)
    .map((range) => ({
      start: range.start < targetStart ? targetStart : range.start,
      end: range.end > targetEnd ? targetEnd : range.end,
    }))
    .sort((left, right) => left.start < right.start ? -1 : left.start > right.start ? 1 : 0);

  let next = targetStart;
  for (const range of relevant) {
    if (range.start > next) return false;
    if (range.end >= targetEnd) return true;
    if (range.end >= next) next = range.end + 1n;
  }
  return false;
}

function isValidTrustedProxy(value: string): boolean {
  const [address, prefix, ...extra] = value.split("/");
  if (!address || address.includes("%") || extra.length > 0) return false;
  const family = isIP(address);
  if (family === 0) return false;
  if (prefix === undefined) return true;
  if (!/^[1-9]\d{0,2}$/.test(prefix)) return false;
  const bits = Number(prefix);
  return bits <= (family === 4 ? 32 : 128);
}

const trustedProxySchema = z.string().refine(
  isValidTrustedProxy,
  {
    message:
      "Trusted proxies must be literal IPv4/IPv6 addresses or CIDRs with a nonzero prefix; unrestricted trust is not allowed.",
  },
);

const trustedProxyListSchema = z.array(trustedProxySchema).superRefine(
  (values, context) => {
    const ranges = values.filter(isValidTrustedProxy).map(trustedProxyRange);
    if (rangesCover(ranges, ipv4MappedStart, ipv4MappedEnd)) {
      context.addIssue({
        code: "custom",
        message: "Trusted proxy entries must not collectively trust the entire IPv4 address space.",
      });
    }
    if (rangesCover(ranges, 0n, ipv6End)) {
      context.addIssue({
        code: "custom",
        message: "Trusted proxy entries must not collectively trust the entire IPv6 address space.",
      });
    }
  },
);

const redisUrlSchema = z.string().url().refine(
  (value) => {
    const protocol = new URL(value).protocol;
    return protocol === "redis:" || protocol === "rediss:";
  },
  { message: "REDIS_URL must use the redis or rediss protocol." },
);

const kafkaBrokerSchema = z.string().trim().refine(
  (value) => {
    const match = /^(?:\[[0-9A-Fa-f:]+\]|[A-Za-z0-9.-]+):(\d{1,5})$/.exec(
      value,
    );
    if (!match) {
      return false;
    }

    const port = Number(match[1]);
    return port > 0 && port <= 65_535;
  },
  {
    message:
      "Kafka brokers must use a host:port value without credentials or a protocol.",
  },
);

const kafkaBrokersSchema = z
  .string()
  .transform((value) => value.split(",").map((broker) => broker.trim()))
  .pipe(z.array(kafkaBrokerSchema).min(1))
  .optional();

const storageEndpointSchema = z.string().url().refine(
  (value) => {
    const endpoint = new URL(value);
    return (
      (endpoint.protocol === "http:" || endpoint.protocol === "https:") &&
      endpoint.username.length === 0 &&
      endpoint.password.length === 0 &&
      (endpoint.pathname === "/" || endpoint.pathname.length === 0) &&
      endpoint.search.length === 0 &&
      endpoint.hash.length === 0
    );
  },
  {
    message:
      "STORAGE_ENDPOINT must be an HTTP(S) origin without credentials, a path, a query, or a fragment.",
  },
);

const storageBucketSchema = z
  .string()
  .min(3)
  .max(63)
  .regex(/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/)
  .refine(
    (value) =>
      !value.includes("..") &&
      !value.includes(".-") &&
      !value.includes("-.") &&
      !/^\d{1,3}(?:\.\d{1,3}){3}$/.test(value),
    { message: "STORAGE_BUCKET must be a valid S3-compatible bucket name." },
  );

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  PORT: z.coerce.number().int().positive().default(4000),

  DATABASE_URL: z.string().min(1),

  TRUSTED_PROXY_CIDRS: z
    .string()
    .default("")
    .transform((value) =>
      value.trim() === "" ? [] : value.split(",").map((entry) => entry.trim()),
    )
    .pipe(trustedProxyListSchema),

  CORS_ALLOWED_ORIGINS: z
    .string()
    .default("http://localhost:3000")
    .transform((value) =>
      value
        .split(",")
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0),
    )
    .pipe(z.array(z.string().url()).min(1)),

  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),

  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(100),

  REQUEST_BODY_LIMIT_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(1_048_576),

  JWT_ISSUER: z.string().min(1).default("sunshine-erp-api"),

  JWT_AUDIENCE: z.string().min(1).default("sunshine-erp"),

  JWT_SECRET: z.string().min(32).default(developmentJwtSecret),

  JWT_ALGORITHM: z.enum(["HS256", "HS384", "HS512"]).default("HS256"),

  JWT_ACCESS_TOKEN_LIFETIME_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(900),

  REFRESH_TOKEN_LIFETIME_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(604_800),

  REFRESH_TOKEN_DIGEST_SECRET: z
    .string()
    .min(32)
    .default(developmentRefreshDigestSecret),

  PASSWORD_MIN_LENGTH: z.coerce.number().int().min(12).default(12),

  BCRYPT_COST: z.coerce.number().int().min(10).max(16).default(12),

  PASSWORD_HISTORY_DEPTH: z.coerce.number().int().positive().default(5),

  ACCOUNT_LOCK_FAILED_ATTEMPTS: z.coerce
    .number()
    .int()
    .positive()
    .default(5),

  ACCOUNT_LOCK_DURATION_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(900_000),

  DEFAULT_MAX_CONCURRENT_SESSIONS: z.coerce
    .number()
    .int()
    .positive()
    .default(5),

  REFRESH_COOKIE_NAME: z
    .string()
    .regex(/^[A-Za-z0-9_-]+$/)
    .default("sunshine_refresh_token"),

  REFRESH_COOKIE_SECURE: booleanFromEnvironment.default(false),

  REFRESH_COOKIE_SAME_SITE: z
    .enum(["strict", "lax", "none"])
    .default("strict"),

  REFRESH_COOKIE_PATH: z.string().startsWith("/").default("/api/v1/auth"),

  PASSWORD_RESET_TOKEN_LIFETIME_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(1_800),

  REDIS_URL: redisUrlSchema.optional(),

  REDIS_CONNECT_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(5_000),

  REDIS_KEY_PREFIX: z
    .string()
    .regex(/^[a-z0-9][a-z0-9_-]*$/)
    .default("sunshine"),

  KAFKA_ENABLED: booleanFromEnvironment.default(false),

  KAFKA_BROKERS: kafkaBrokersSchema,

  KAFKA_CLIENT_ID: z
    .string()
    .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/)
    .default("sunshine-erp-api"),

  STORAGE_ENABLED: booleanFromEnvironment.default(false),

  STORAGE_ENDPOINT: storageEndpointSchema.optional(),

  STORAGE_ACCESS_KEY: z.string().min(3).max(128).optional(),

  STORAGE_SECRET_KEY: z.string().min(8).max(128).optional(),

  STORAGE_BUCKET: storageBucketSchema.optional(),

  STORAGE_REGION: z
    .string()
    .regex(/^[a-z0-9][a-z0-9-]{0,62}$/)
    .default("us-east-1"),

  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace"])
    .default("info"),
}).superRefine((configuration, context) => {
  if (
    configuration.NODE_ENV === "production" &&
    configuration.JWT_SECRET === developmentJwtSecret
  ) {
    context.addIssue({
      code: "custom",
      path: ["JWT_SECRET"],
      message: "JWT_SECRET must be configured for production.",
    });
  }

  if (
    configuration.NODE_ENV === "production" &&
    configuration.REFRESH_TOKEN_DIGEST_SECRET ===
      developmentRefreshDigestSecret
  ) {
    context.addIssue({
      code: "custom",
      path: ["REFRESH_TOKEN_DIGEST_SECRET"],
      message: "REFRESH_TOKEN_DIGEST_SECRET must be configured for production.",
    });
  }

  if (
    configuration.NODE_ENV === "production" &&
    !configuration.REFRESH_COOKIE_SECURE
  ) {
    context.addIssue({
      code: "custom",
      path: ["REFRESH_COOKIE_SECURE"],
      message: "REFRESH_COOKIE_SECURE must be true in production.",
    });
  }

  if (
    configuration.REFRESH_COOKIE_SAME_SITE === "none" &&
    !configuration.REFRESH_COOKIE_SECURE
  ) {
    context.addIssue({
      code: "custom",
      path: ["REFRESH_COOKIE_SECURE"],
      message: "SameSite=None refresh cookies must be Secure.",
    });
  }

  if (configuration.KAFKA_ENABLED && !configuration.KAFKA_BROKERS) {
    context.addIssue({
      code: "custom",
      path: ["KAFKA_BROKERS"],
      message: "KAFKA_BROKERS is required when Kafka is enabled.",
    });
  }

  if (configuration.STORAGE_ENABLED) {
    const requiredStorageValues = [
      ["STORAGE_ENDPOINT", configuration.STORAGE_ENDPOINT],
      ["STORAGE_ACCESS_KEY", configuration.STORAGE_ACCESS_KEY],
      ["STORAGE_SECRET_KEY", configuration.STORAGE_SECRET_KEY],
      ["STORAGE_BUCKET", configuration.STORAGE_BUCKET],
    ] as const;

    for (const [name, value] of requiredStorageValues) {
      if (value === undefined) {
        context.addIssue({
          code: "custom",
          path: [name],
          message: `${name} is required when object storage is enabled.`,
        });
      }
    }
  }
});

export type Environment = z.infer<typeof envSchema>;

export function parseEnvironment(
  input: Record<string, string | undefined>,
): Environment {
  return envSchema.parse(input);
}

export const env = parseEnvironment(process.env);
