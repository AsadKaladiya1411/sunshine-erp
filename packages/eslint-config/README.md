# `@sunshine-erp/eslint-config`

Private shared ESLint flat configurations for Sunshine ERP workspaces.

## Exports

- `@sunshine-erp/eslint-config/base` provides the repository-wide JavaScript,
  TypeScript, Prettier, and Turborepo baseline.
- `@sunshine-erp/eslint-config/node` adds Node.js globals and the shared
  underscore-prefixed unused-parameter convention for backend and foundation
  packages.
- `@sunshine-erp/eslint-config/next-js` provides the Next.js and React rules used
  by `apps/web`.
- `@sunshine-erp/eslint-config/react-internal` provides the React rules used by
  internal UI packages.

Each consuming workspace imports the appropriate exported configuration from
its flat ESLint configuration. This package is internal to the monorepo and is
not published.
