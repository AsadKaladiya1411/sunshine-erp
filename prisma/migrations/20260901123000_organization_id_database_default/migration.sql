-- Prisma must leave Organization.id to PostgreSQL when the identifier also
-- participates in nullable tenant-safe audit-actor composite relations.
-- gen_random_uuid() preserves the approved UUID identity convention.
ALTER TABLE "organizations"
ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
