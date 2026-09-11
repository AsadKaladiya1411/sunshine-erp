# Sunshine ERP Web

This workspace is the Next.js web application for Sunshine ERP. Its current UI
implements the browser authentication foundation and a protected application
entry placeholder; real ERP business screens and workflows are not implemented
yet.

## Commands

Run these commands from the repository root:

```bash
npm run dev --workspace=web
npm test --workspace=web
npm run build --workspace=web
npm run lint --workspace=web
npm run check-types --workspace=web
```

The development server runs at [http://localhost:3000](http://localhost:3000).
Copy `.env.example` to an ignored local environment file and set
`NEXT_PUBLIC_API_BASE_URL` to the browser-reachable API origin. This value is
public browser configuration and must not contain secrets.

## Current structure

- `app/` contains the App Router layout, public login route, protected entry
  route, and global styles.
- `components/auth/` contains the login and protected authentication views.
- `lib/api/` contains the typed fetch boundary for the existing API contract.
- `lib/auth/` contains memory-only authentication state and session restoration.
- `public/` contains the current static starter assets.
- `eslint.config.js` consumes the shared Sunshine ERP Next.js ESLint preset.
- `tsconfig.json` consumes the shared Sunshine ERP TypeScript configuration.

The web application uses `@sunshine-erp/ui` for reusable UI components. Backend
authorization and business rules remain authoritative and must not be
implemented only in this workspace.
