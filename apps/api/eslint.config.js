import { nodeConfig } from "@sunshine-erp/eslint-config/node";

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...nodeConfig,
  {
    ignores: ["src/generated/**"],
  },
  {
    files: ["src/**/*.test.ts"],
    rules: {
      "turbo/no-undeclared-env-vars": [
        "warn",
        { allowList: ["^(DATABASE_URL|REDIS_URL)$"] },
      ],
    },
  },
];
