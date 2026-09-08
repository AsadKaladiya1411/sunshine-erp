import { nodeConfig } from "@sunshine-erp/eslint-config/node";

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...nodeConfig,
  {
    files: ["src/object-key.ts"],
    rules: {
      "no-control-regex": "off",
    },
  },
];
