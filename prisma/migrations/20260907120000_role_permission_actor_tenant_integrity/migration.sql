BEGIN;

-- Fail before changing the table if an existing assignment attributes an
-- organization-scoped Role to an actor from another organization.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "role_permissions" AS "assignment"
    JOIN "roles" AS "role"
      ON "role"."id" = "assignment"."role_id"
    JOIN "users" AS "actor"
      ON "actor"."id" = "assignment"."assigned_by"
    WHERE "role"."organization_id" <> "actor"."organization_id"
  ) THEN
    RAISE EXCEPTION 'Cannot enforce RolePermission actor tenant integrity: conflicting rows exist.';
  END IF;
END
$$;

-- Persist the Role-owned tenant key and backfill every existing assignment.
ALTER TABLE "role_permissions"
ADD COLUMN "organization_id" UUID;

UPDATE "role_permissions" AS "assignment"
SET "organization_id" = "role"."organization_id"
FROM "roles" AS "role"
WHERE "role"."id" = "assignment"."role_id";

ALTER TABLE "role_permissions"
ALTER COLUMN "organization_id" SET NOT NULL;

CREATE INDEX "role_permissions_organization_id_idx"
ON "role_permissions"("organization_id");

-- Replace independent Role and actor keys with tenant-safe composite keys.
ALTER TABLE "role_permissions"
DROP CONSTRAINT "role_permissions_role_id_fkey",
DROP CONSTRAINT "role_permissions_assigned_by_fkey";

ALTER TABLE "role_permissions"
ADD CONSTRAINT "role_permissions_role_id_organization_id_fkey"
FOREIGN KEY ("role_id", "organization_id")
REFERENCES "roles"("id", "organization_id")
ON DELETE RESTRICT ON UPDATE CASCADE,
ADD CONSTRAINT "role_permissions_assigned_by_organization_id_fkey"
FOREIGN KEY ("assigned_by", "organization_id")
REFERENCES "users"("id", "organization_id")
ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
