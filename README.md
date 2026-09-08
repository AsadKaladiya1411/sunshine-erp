# Sunshine ERP

This repository contains the current Sunshine ERP platform foundation. It
includes the API, worker, shared infrastructure packages, database foundation,
and supporting development configuration. Real ERP business modules are not
implemented yet, and `apps/web` still contains starter UI content.

## First tenant bootstrap

After applying all Prisma migrations to a new database, initialize the first
tenant and administrator exactly once with the CLI below:

```powershell
npm run bootstrap:first-tenant -- --organization-code=SUNSHINE --organization-name="Sunshine Corporation" --department-code=ADMIN --department-name="Administration" --admin-first-name="First" --admin-last-name="Administrator" --admin-username=admin --admin-email=admin@example.com
```

The CLI prompts twice for the administrator password without displaying it.
The password is never accepted as a command-line argument. For non-interactive
automation, `--password-stdin` accepts one password line from protected
redirected standard input; do not place the password in shell history or a
world-readable file.

The command is deliberately fail-closed. It works only when the migrated
database has no organization, user, administration configuration, session,
RBAC, or activity-log state. The organization, required department, first
administrator, initial authorization records, and audit records commit in one
transaction. Every later or concurrent attempt fails without mutation.

Bootstrap creates one non-wildcard tenant role and permission:

- Role: `ADMINISTRATOR` (`Administrator`)
- Permission: `administration.manage`

Organization settings and financial-year data are not created because they
are not required for authentication and no business defaults are assumed.
Normal Administration HTTP workflows for later users, tenants, roles, and
permissions are not currently exposed. The one-time bootstrap CLI exists only
for the initial tenant and administrator bootstrap; do not reuse it as a
substitute for future Administration endpoints, recovery, or routine account
creation.

## Runtime requirements

- Node.js `^20.19 || ^22.12 || >=24.0`
- npm `11.17.0`

## Repository structure

### Applications

- `apps/api` - Express API foundation, including health checks, OpenAPI,
  authentication, authorization, audit, Approval, and database integration.
- `apps/worker` - background-worker runtime and Kafka consumer foundation.
- `apps/web` - Next.js application shell; its current interface remains starter
  content and is not a completed ERP frontend.

### Active packages

- `@sunshine-erp/business-rules` - business-rules engine foundation.
- `@sunshine-erp/config` - centralized environment configuration.
- `@sunshine-erp/eslint-config` - shared ESLint configuration.
- `@sunshine-erp/messaging` - shared Kafka infrastructure.
- `@sunshine-erp/notifications` - notification contracts and service
  foundation.
- `@sunshine-erp/storage` - S3-compatible object-storage infrastructure.
- `@sunshine-erp/types` - shared TypeScript contracts.
- `@sunshine-erp/typescript-config` - shared TypeScript configuration.
- `@sunshine-erp/ui` - shared React UI components.
- `@sunshine-erp/workflow` - workflow-engine foundation.

`packages/shared` and `packages/validation` are currently empty reserved
directories, not active npm workspaces.

Supporting project areas include `prisma` for the schema and migrations,
`infrastructure` for local infrastructure configuration, and `docs` for
project documentation.

## Commands

Run repository-wide tasks from the repository root:

```sh
npm run dev
npm run build
npm run check-types
npm run lint
npm run prisma:validate
npm run prisma:generate
```

Run an application independently through its workspace when needed:

```sh
npm run dev --workspace=api
npm run dev --workspace=worker
npm run dev --workspace=web
```

## Optional tooling references

- [Turborepo tasks](https://turborepo.dev/docs/crafting-your-repository/running-tasks)
- [Turborepo configuration](https://turborepo.dev/docs/reference/configuration)
