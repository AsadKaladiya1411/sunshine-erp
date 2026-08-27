-- AlterTable
ALTER TABLE "permissions"
ADD COLUMN "resource" VARCHAR(100);

-- AlterTable
ALTER TABLE "role_assignments"
ADD COLUMN "assigned_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "expires_at" TIMESTAMPTZ(6);
