# Sunshine Corporation — NO CHEAT® ERP
# Codex Development Contract

## 1. Project Identity

Company: Sunshine Corporation

Brand: NO CHEAT®

Project: Enterprise ERP System

This is a real production ERP.

It is not a demo, tutorial, prototype, or generic CRUD application.

The architecture must support the current 5–10 user deployment while remaining capable of scaling to hundreds or 1,000+ users without requiring a fundamental architectural rewrite.

---

# 2. Source of Truth

Development decisions must follow this priority:

1. Approved business requirements
2. Approved business architecture
3. Domain model
4. Entity model
5. Approved database design
6. Approved business calculations and rules
7. Frozen system architecture
8. Frozen technology stack
9. Approved UI/UX specification
10. Existing implementation

Never reverse this order.

Code must not redefine business requirements.

Do not invent:

- business rules
- calculations
- database entities
- workflows
- permissions
- modules
- approval rules

If a requirement is unclear or conflicting, stop and report the conflict instead of guessing.

---

# 3. Current Development Strategy

Development is initially local/self-hosted.

AWS, Azure and Google Cloud are NOT immediate deployment dependencies.

Cloud deployment will be decided later based on:

- actual workload
- cost
- security
- company requirements
- operational requirements
- scalability

The application must remain cloud-ready.

Do not introduce cloud-provider-specific dependencies into core business logic unless explicitly required.

---

# 4. Architecture

Primary architecture:

MODULAR MONOLITH + EVENT-DRIVEN ARCHITECTURE

Do NOT convert the ERP into microservices.

Business domains remain modules inside the monolith.

Individual services may be extracted in the future only when actual scale or operational requirements justify it.

Backend architecture:

- Node.js
- Express.js
- TypeScript
- REST API
- OpenAPI
- Prisma
- Zod
- Service Layer
- Repository Pattern
- Dependency Injection
- Domain Events
- Transactional Outbox
- Workflow Engine
- Approval Engine
- Business Rules Engine

---

# 5. Monorepo

Use Turborepo.

Repository structure:

apps/
  web/
  api/
  worker/

packages/
  ui/
  types/
  validation/
  config/
  shared/
  eslint-config/
  typescript-config/

prisma/

infrastructure/

docs/

tests/

scripts/

.github/

AGENTS.md

---

# 6. Frontend

Technology:

- React
- Next.js
- TypeScript
- Tailwind CSS
- shadcn/ui
- React Hook Form
- Zod
- TanStack Query
- Redux Toolkit
- TanStack Table
- Apache ECharts
- Tiptap
- PWA support

Frontend responsibilities:

TanStack Query:
- server state
- API data
- caching
- synchronization

Redux Toolkit:
- only genuinely global client state

React Hook Form:
- forms

Zod:
- client-side validation

TanStack Table:
- ERP data tables

ECharts:
- dashboards and analytics

The frontend must never be the authoritative source for business rules or authorization.

---

# 7. UI / UX

Brand:

NO CHEAT®

Current visual direction:

- white header
- NO CHEAT® logo in the white header
- dark green sidebar
- white/light main workspace
- black/charcoal text
- dark green primary actions
- restrained green/lime accents
- semantic colors for success, warning, error and information

v0 is ONLY a visual reference.

Mobbin is ONLY a UX research/reference source.

Neither v0 nor Mobbin overrides ERP requirements.

UX must follow:

Requirements
→ Domain
→ Entity
→ Workflow
→ Business Rules
→ User Role
→ Screen Behavior

Do not copy generic forms across modules when the business process requires a different interaction model.

Every screen must be evaluated for:

- business correctness
- usability
- role
- permissions
- workflow
- validation
- audit
- related records
- responsive behavior

---

# 8. Backend

Backend is a modular monolith.

Target:

apps/api/src/

core/
  auth/
  authorization/
  database/
  events/
  outbox/
  cache/
  queue/
  storage/
  logging/
  observability/

modules/

middleware/

routes/

app.ts

server.ts

Do not put all business logic into controllers.

Controller:
→ validates/request handling

Application/service:
→ orchestration

Domain:
→ business rules

Repository:
→ persistence abstraction

Infrastructure:
→ technical implementations

---

# 9. Domain Modules

Approved business domains include:

- Administration
- Product Management
- Production Planning
- Purchase
- Warehouse
- Inventory
- QA/QC
- Production
- Job Work
- Sales
- CRM
- Costing
- R&D
- Approval Workflow
- Document Management
- Audit
- Notifications
- Settings
- Reports
- Dashboards

Do not create duplicate modules.

Do not merge domains merely for convenience.

Every domain must have clear ownership.

---

# 10. Domain Boundaries

Examples:

Purchase owns procurement.

Warehouse owns physical warehouse operations.

Inventory owns authoritative stock state.

QA/QC owns quality decisions.

Production owns manufacturing execution.

Job Work owns third-party manufacturing processes.

R&D owns research and experimentation.

Costing owns costing calculations.

Approval owns approval processes.

Documents owns document management.

Audit owns audit history.

Notifications owns notification delivery.

Reports owns reporting/read-oriented workloads.

A module must not directly modify another module's database-owned state.

Example:

Production must not directly manipulate inventory tables.

Instead:

Production
→ Inventory service/domain operation
→ Inventory transaction
→ Database

Purchase must not directly change QA/QC decisions.

Sales must not directly change inventory quantities.

R&D must not silently create production records.

---

# 11. Database

Primary database:

PostgreSQL

ORM:

Prisma

Database requirements:

- foreign keys
- transactions
- constraints
- indexes
- audit tables
- version history
- pgvector for approved AI use cases
- future partitioning where justified
- future read replicas where justified

The approved database/entity design is authoritative.

Do not casually:

- add tables
- delete tables
- rename tables
- merge tables
- split tables
- change relationships

Any schema change must identify:

- requirement
- domain owner
- relationship impact
- migration impact
- API impact
- UI impact
- reporting impact
- audit impact

---

# 12. PostgreSQL Is the Source of Truth

PostgreSQL is authoritative for ERP transactional data.

Redis is NOT the source of truth.

Kafka is NOT the source of truth.

Frontend state is NOT the source of truth.

Caches are NOT the source of truth.

External integrations are NOT allowed to directly modify ERP database tables.

---

# 13. Redis

Redis may be used for:

- cache
- temporary session state
- distributed locks
- rate limiting
- OTP
- queue-related support
- short-lived data

Never store critical ERP transactional truth only in Redis.

Cache invalidation must be considered whenever authoritative data changes.

---

# 14. Event Architecture

Use:

- Kafka
- Domain Events
- Transactional Outbox
- Event Consumers
- Event Replay

Critical transaction flow:

Business Operation
→ PostgreSQL Transaction
→ Outbox Record
→ Event Publisher
→ Kafka
→ Consumer

Do not create a critical database transaction and separately publish an event in a way that can permanently diverge.

Events should contain enough information for consumers to process them safely.

Consumers must be idempotent where duplicate delivery is possible.

---

# 15. Background Jobs

Worker application:

apps/worker/

Responsibilities may include:

- Kafka consumers
- background jobs
- report generation
- email
- SMS
- document processing
- bulk operations
- integrations
- scheduled jobs

Long-running work must not block normal API requests.

Use queues for asynchronous workloads.

---

# 16. Authentication

Use:

- JWT
- refresh tokens
- session tracking
- password reset
- account lock
- MFA-ready architecture

Password hashing:

bcrypt

Authentication must be centralized.

Never implement independent authentication logic inside individual business modules.

---

# 17. Authorization

Use centralized RBAC.

Concept:

User
→ Role
→ Permission
→ Module
→ Action

Support:

- role assignment
- permission matrix
- dynamic permissions
- approval roles

Backend authorization is authoritative.

Frontend visibility is NOT security.

Every protected API operation must enforce authorization server-side.

---

# 18. Approval Engine

Approval is separate from RBAC.

RBAC answers:

"Can this user perform this action?"

Approval answers:

"Who must approve this business transaction?"

Example:

Draft
→ Submitted
→ Manager Approval
→ Director Approval
→ Approved
→ Released

Approval history must be preserved.

Approval steps must be configurable where requirements allow.

---

# 19. Workflow Engine

Workflow controls business-state transitions.

Approval controls approval decisions.

RBAC controls authorization.

These are separate systems.

Example:

Purchase Order:

Draft
→ Submitted
→ Approved
→ Released
→ Partially Received
→ Fully Received
→ Closed

Only valid state transitions may be allowed.

---

# 20. Business Rules Engine

Business rules must be centralized where appropriate.

Example:

IF amount > configured threshold

THEN required approval level changes.

Do not hard-code large collections of business rules throughout controllers/components.

Rules must be:

- testable
- traceable
- reusable
- version-aware where necessary

---

# 21. Audit Trail

Audit is centralized.

Audit may contain:

- user
- entity
- record ID
- action
- old value
- new value
- timestamp
- IP
- reason
- correlation/context information

Audit history is immutable through normal application workflows.

Do not implement separate audit systems inside every module.

---

# 22. Documents

Use centralized Document Management.

Core concepts:

Document
Attachment
Version

Documents may relate to:

- products
- vendors
- customers
- purchase
- GRN
- QA/QC
- COA
- production
- batches
- sales
- R&D
- compliance
- job work

Physical files:

Development:
MinIO

Future production:
S3-compatible object storage

Database:
document metadata and relationships

---

# 23. Notifications

Centralized Notification Service.

Channels:

- in-app
- email
- SMS
- WhatsApp
- push

Notification delivery should normally be asynchronous.

Notification failure must not unnecessarily fail the primary ERP transaction.

---

# 24. Search

Current:

PostgreSQL Full Text Search

Future:

OpenSearch

Search must respect authorization.

A user must never discover records they are not authorized to access.

---

# 25. Real-Time

WebSocket/real-time features may be used for:

- dashboard updates
- notifications
- inventory status
- production status
- approval status
- job work status

Do not make every ERP screen real-time unnecessarily.

Use real-time only where it provides real business value.

---

# 26. API Standards

APIs must follow consistent standards.

Use:

- versioning
- pagination
- filtering
- sorting
- validation
- correlation IDs
- idempotency keys
- consistent error responses
- authorization
- OpenAPI documentation

Example:

GET /api/v1/products

POST /api/v1/purchase-orders

Do not create inconsistent endpoint naming.

---

# 27. Idempotency

Critical operations must be protected from duplicate execution.

Examples:

- payment
- stock movement
- GRN
- approval
- document processing
- external integration
- bulk imports

Use idempotency keys or domain-level uniqueness where appropriate.

---

# 28. Reliability

Implement:

- health checks
- readiness probes
- liveness probes
- retries
- circuit breakers
- dead letter queues
- graceful shutdown
- concurrency control
- distributed locks where justified

Retries must not create duplicate business transactions.

---

# 29. Observability

Use:

- OpenTelemetry
- Prometheus
- Grafana
- Pino

Production can later integrate with cloud-native monitoring.

Logs must contain useful context.

Never log:

- passwords
- tokens
- secrets
- API keys
- sensitive credentials

---

# 30. Testing

Use:

- Jest
- React Testing Library
- Playwright
- Testcontainers
- Postman

Testing layers:

1. Unit
2. Integration
3. API
4. Database
5. End-to-end
6. Critical workflow testing

Critical ERP workflows must have automated tests.

Examples:

Purchase
→ GRN
→ QA
→ Inventory

Production
→ Consumption
→ Output
→ Inventory

Sales
→ Order
→ Fulfillment
→ Dispatch

Approval
→ Submission
→ Approval
→ Release

---

# 31. Infrastructure

Development:

Docker
Docker Compose

Orchestration-ready:

Kubernetes
Helm

Cloud deployment is postponed.

Do not add cloud-specific implementation to core business modules.

Infrastructure must remain portable wherever practical.

---

# 32. Infrastructure as Code

Terraform is part of the approved technology stack.

Do not provision production infrastructure manually when infrastructure-as-code becomes part of deployment.

Infrastructure changes must be reviewable and reproducible.

---

# 33. Security

Follow secure-by-default principles.

Use:

- Helmet
- CORS
- CSRF protection where applicable
- XSS protection
- parameterized database access
- bcrypt
- rate limiting
- secret management
- audit logging
- HTTPS in deployed environments

Never commit secrets.

Never put credentials directly into source code.

Use environment variables/configuration management.

---

# 34. Configuration

Configuration must be centralized.

Do not scatter environment-variable access throughout business logic.

Separate:

- development
- test
- staging
- production

Never commit production secrets.

Maintain:

.env.example

with safe placeholder values only.

---

# 35. Shared Packages

packages/ui
→ reusable UI system

packages/types
→ shared TypeScript contracts

packages/validation
→ shared Zod validation

packages/config
→ centralized shared configuration

packages/shared
→ genuinely generic shared utilities

Do not turn `shared` into a dumping ground.

If logic belongs to a business domain, keep it in that domain.

---

# 36. Coding Standards

Use TypeScript strict mode.

Avoid `any`.

Prefer explicit types.

Validate external input.

Use clear naming.

Keep functions focused.

Keep modules cohesive.

Avoid circular dependencies.

Avoid duplicated business logic.

Avoid magic constants.

Do not hide business logic inside React components.

Do not put business rules inside controllers.

Do not bypass domain services for convenience.

---

# 37. Error Handling

Use structured application errors.

Errors should contain appropriate:

- code
- message
- HTTP status
- context
- correlation ID

Do not expose internal stack traces or sensitive implementation details to clients.

---

# 38. Database Access Rules

Do not allow arbitrary modules to directly access another module's persistence layer.

Repositories belong to their owning domain.

Cross-domain operations must use approved application/domain interfaces.

Database transactions must be used for operations that require atomicity.

---

# 39. UI/Backend Contract

Frontend forms and screens must reflect backend contracts.

Zod schemas may be shared where appropriate.

The backend remains authoritative.

Never rely only on frontend validation.

---

# 40. Feature Flags

Feature flags may control:

- beta modules
- AI functionality
- experimental UI
- gradual rollout
- optional integrations

Do not use feature flags to hide broken core functionality permanently.

---

# 41. AI

Approved AI technologies include:

- OpenAI
- Ollama
- embeddings
- pgvector
- RAG
- LangChain
- MCP
- AI Agents
- OCR
- Document AI

AI must not bypass ERP authorization, transactions or business rules.

AI-generated data must be treated as untrusted until validated.

OCR output must be reviewed/validated before becoming authoritative ERP data.

AI must not directly modify critical ERP records without controlled business workflows.

---

# 42. External Integrations

Integrations may include:

- payment gateways
- courier APIs
- GST APIs
- email
- SMS
- WhatsApp
- e-commerce
- third-party APIs

External integrations must be isolated behind integration/service boundaries.

External systems must not directly modify ERP database tables.

Integration failures must be retryable and observable.

---

# 43. Master Data

Master data includes concepts such as:

- product
- customer
- vendor
- employee
- UOM
- warehouse
- location

Master data must have controlled ownership and validation.

Do not duplicate master records across modules.

---

# 44. Localization

Support architecture for:

- English
- Gujarati
- Hindi
- currency
- timezone
- date format

Do not hard-code user-facing text inside business logic.

---

# 45. Development Process

Before implementing a feature:

1. Identify the requirement.
2. Identify the domain owner.
3. Identify entities/tables.
4. Identify business rules.
5. Identify workflow.
6. Identify permissions.
7. Identify audit requirements.
8. Identify events/integrations.
9. Identify UI/UX requirements.
10. Define tests.
11. Implement.
12. Verify cross-module impact.

Do not begin by creating random CRUD endpoints.

---

# 46. Codex Rules

Codex must not independently redesign the architecture.

Codex must not:

- invent modules
- invent tables
- invent business rules
- rewrite architecture
- delete existing work
- replace technologies
- introduce microservices without approval
- change frozen technology choices without approval
- silently change API contracts
- silently change database relationships

When a requirement is unclear:

STOP.

Explain the ambiguity.

Ask for approval.

When an architectural conflict is found:

STOP.

Report:

- conflict
- affected components
- current authoritative source
- proposed options

Do not silently resolve it.

---

# 47. Implementation Discipline

Every implementation should be small and reviewable.

Preferred flow:

Requirement
→ Design
→ Implementation
→ Tests
→ Verification
→ Review
→ Commit

Do not implement large unrelated changes in one task.

Do not mix:

- architecture changes
- feature development
- dependency upgrades
- refactoring

unless explicitly requested.

---

# 48. Git Discipline

Use meaningful commits.

Examples:

feat(auth): add authentication foundation

feat(rbac): add permission model

feat(audit): add audit infrastructure

fix(inventory): prevent duplicate stock movement

chore(repo): configure worker workspace

Do not commit:

- .env
- secrets
- credentials
- generated sensitive files
- unnecessary build artifacts

---

# 49. Current Development Phase

The repository foundation is being established.

Current priorities:

1. Monorepo
2. API foundation
3. Worker foundation
4. Shared packages
5. Prisma/PostgreSQL foundation
6. Configuration
7. Logging
8. Error handling
9. API standards
10. Authentication
11. RBAC
12. Audit
13. Redis
14. Event/Outbox infrastructure
15. Kafka
16. Worker infrastructure
17. Documents
18. Notifications
19. First business module

Do not jump directly into business modules before the platform foundation is stable.

---

# 50. Final Rule

The ERP architecture is the source of truth.

The implementation must adapt to the business.

The business must NOT be forced to adapt to convenient code.

When in doubt:

STOP → EXPLAIN → ASK.

Never guess critical ERP behavior.