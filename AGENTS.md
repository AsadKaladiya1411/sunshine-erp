# Truck Hisab Development Contract

## Project state

Truck Hisab is being rebuilt from a clean foundation. Business requirements
have not been approved yet, so do not invent business modules, database tables,
workflows, permissions, calculations, or integrations.

## Repository structure

- `frontend/` is an independent Next.js application.
- `backend/` is an independent Express and TypeScript application.
- Each application owns its package metadata, dependencies, configuration, and
  runtime commands.

## Backend structure

Use a simple MVC boundary:

- routes receive HTTP paths
- controllers handle HTTP requests and responses
- models represent application/domain data
- middleware handles cross-cutting HTTP behavior
- config owns environment access

Keep controllers small. Do not place database queries in controllers.

## Current restrictions

- PostgreSQL, Prisma, Redis, Kafka, Docker, workers, storage, authentication,
  authorization, and ERP modules are not part of the current scaffold.
- Add infrastructure or business functionality only after its requirement is
  explicitly approved.
- Never commit secrets or local `.env` files.
- Keep TypeScript strict and validate all future external input.
