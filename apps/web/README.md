# Sunshine ERP Web

This workspace is the Next.js web application shell for Sunshine ERP. It still
contains starter UI content; real ERP business screens and workflows are not
implemented yet.

## Commands

Run these commands from the repository root:

```bash
npm run dev --workspace=web
npm run build --workspace=web
npm run lint --workspace=web
npm run check-types --workspace=web
```

The development server runs at [http://localhost:3000](http://localhost:3000).

## Current structure

- `app/` contains the App Router layout, page, and global styles.
- `public/` contains the current static starter assets.
- `eslint.config.mjs` consumes the shared Sunshine ERP Next.js ESLint preset.
- `tsconfig.json` consumes the shared Sunshine ERP TypeScript configuration.

The web application uses `@sunshine-erp/ui` for reusable UI components. Backend
authorization and business rules remain authoritative and must not be
implemented only in this workspace.
