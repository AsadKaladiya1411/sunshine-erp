BEGIN;

-- Add tenant anchors without defaults so existing rows can be backfilled safely.
ALTER TABLE "approval_levels" ADD COLUMN "organization_id" UUID;
ALTER TABLE "approval_actions" ADD COLUMN "organization_id" UUID;
ALTER TABLE "approval_histories" ADD COLUMN "organization_id" UUID;

UPDATE "approval_levels" AS level
SET "organization_id" = configuration."organization_id"
FROM "approval_configurations" AS configuration
WHERE configuration."id" = level."approval_configuration_id";

UPDATE "approval_actions" AS action
SET "organization_id" = request."organization_id"
FROM "approval_requests" AS request
WHERE request."id" = action."approval_request_id";

UPDATE "approval_histories" AS history
SET "organization_id" = request."organization_id"
FROM "approval_requests" AS request
WHERE request."id" = history."approval_request_id";

ALTER TABLE "approval_levels" ALTER COLUMN "organization_id" SET NOT NULL;
ALTER TABLE "approval_actions" ALTER COLUMN "organization_id" SET NOT NULL;
ALTER TABLE "approval_histories" ALTER COLUMN "organization_id" SET NOT NULL;

-- Composite parent keys required by tenant-safe foreign keys.
CREATE UNIQUE INDEX "approval_configurations_id_organization_id_key"
ON "approval_configurations"("id", "organization_id");
CREATE UNIQUE INDEX "approval_levels_id_organization_id_key"
ON "approval_levels"("id", "organization_id");
CREATE UNIQUE INDEX "approval_requests_id_organization_id_key"
ON "approval_requests"("id", "organization_id");
CREATE UNIQUE INDEX "approval_actions_id_organization_id_key"
ON "approval_actions"("id", "organization_id");

CREATE INDEX "approval_levels_organization_id_idx"
ON "approval_levels"("organization_id");
CREATE INDEX "approval_actions_organization_id_idx"
ON "approval_actions"("organization_id");
CREATE INDEX "approval_histories_organization_id_idx"
ON "approval_histories"("organization_id");

-- Replace single-column Approval foreign keys with tenant-safe composite keys.
ALTER TABLE "approval_configurations" DROP CONSTRAINT "approval_configurations_created_by_fkey";
ALTER TABLE "approval_configurations" DROP CONSTRAINT "approval_configurations_updated_by_fkey";

ALTER TABLE "approval_levels" DROP CONSTRAINT "approval_levels_approval_configuration_id_fkey";
ALTER TABLE "approval_levels" DROP CONSTRAINT "approval_levels_approver_user_id_fkey";
ALTER TABLE "approval_levels" DROP CONSTRAINT "approval_levels_approver_role_id_fkey";
ALTER TABLE "approval_levels" DROP CONSTRAINT "approval_levels_created_by_fkey";
ALTER TABLE "approval_levels" DROP CONSTRAINT "approval_levels_updated_by_fkey";

ALTER TABLE "approval_requests" DROP CONSTRAINT "approval_requests_approval_configuration_id_fkey";
ALTER TABLE "approval_requests" DROP CONSTRAINT "approval_requests_requested_by_fkey";
ALTER TABLE "approval_requests" DROP CONSTRAINT "approval_requests_current_level_id_fkey";
ALTER TABLE "approval_requests" DROP CONSTRAINT "approval_requests_created_by_fkey";
ALTER TABLE "approval_requests" DROP CONSTRAINT "approval_requests_updated_by_fkey";

ALTER TABLE "approval_actions" DROP CONSTRAINT "approval_actions_approval_request_id_fkey";
ALTER TABLE "approval_actions" DROP CONSTRAINT "approval_actions_approval_level_id_fkey";
ALTER TABLE "approval_actions" DROP CONSTRAINT "approval_actions_approver_user_id_fkey";
ALTER TABLE "approval_actions" DROP CONSTRAINT "approval_actions_delegated_to_user_id_fkey";
ALTER TABLE "approval_actions" DROP CONSTRAINT "approval_actions_created_by_fkey";
ALTER TABLE "approval_actions" DROP CONSTRAINT "approval_actions_updated_by_fkey";

ALTER TABLE "approval_histories" DROP CONSTRAINT "approval_histories_approval_request_id_fkey";
ALTER TABLE "approval_histories" DROP CONSTRAINT "approval_histories_approval_level_id_fkey";
ALTER TABLE "approval_histories" DROP CONSTRAINT "approval_histories_approval_action_id_fkey";
ALTER TABLE "approval_histories" DROP CONSTRAINT "approval_histories_performed_by_fkey";
ALTER TABLE "approval_histories" DROP CONSTRAINT "approval_histories_created_by_fkey";

ALTER TABLE "approval_delegations" DROP CONSTRAINT "approval_delegations_delegator_user_id_fkey";
ALTER TABLE "approval_delegations" DROP CONSTRAINT "approval_delegations_delegate_user_id_fkey";
ALTER TABLE "approval_delegations" DROP CONSTRAINT "approval_delegations_approval_configuration_id_fkey";
ALTER TABLE "approval_delegations" DROP CONSTRAINT "approval_delegations_approval_level_id_fkey";
ALTER TABLE "approval_delegations" DROP CONSTRAINT "approval_delegations_created_by_fkey";
ALTER TABLE "approval_delegations" DROP CONSTRAINT "approval_delegations_updated_by_fkey";

ALTER TABLE "approval_configurations"
ADD CONSTRAINT "approval_configurations_created_by_organization_id_fkey"
FOREIGN KEY ("created_by", "organization_id")
REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "approval_configurations"
ADD CONSTRAINT "approval_configurations_updated_by_organization_id_fkey"
FOREIGN KEY ("updated_by", "organization_id")
REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "approval_levels"
ADD CONSTRAINT "approval_levels_approval_configuration_id_organization_id_fkey"
FOREIGN KEY ("approval_configuration_id", "organization_id")
REFERENCES "approval_configurations"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "approval_levels"
ADD CONSTRAINT "approval_levels_approver_user_id_organization_id_fkey"
FOREIGN KEY ("approver_user_id", "organization_id")
REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "approval_levels"
ADD CONSTRAINT "approval_levels_approver_role_id_organization_id_fkey"
FOREIGN KEY ("approver_role_id", "organization_id")
REFERENCES "roles"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "approval_levels"
ADD CONSTRAINT "approval_levels_created_by_organization_id_fkey"
FOREIGN KEY ("created_by", "organization_id")
REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "approval_levels"
ADD CONSTRAINT "approval_levels_updated_by_organization_id_fkey"
FOREIGN KEY ("updated_by", "organization_id")
REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "approval_requests"
ADD CONSTRAINT "approval_requests_approval_configuration_id_organization_i_fkey"
FOREIGN KEY ("approval_configuration_id", "organization_id")
REFERENCES "approval_configurations"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "approval_requests"
ADD CONSTRAINT "approval_requests_requested_by_organization_id_fkey"
FOREIGN KEY ("requested_by", "organization_id")
REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "approval_requests"
ADD CONSTRAINT "approval_requests_current_level_id_organization_id_fkey"
FOREIGN KEY ("current_level_id", "organization_id")
REFERENCES "approval_levels"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "approval_requests"
ADD CONSTRAINT "approval_requests_created_by_organization_id_fkey"
FOREIGN KEY ("created_by", "organization_id")
REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "approval_requests"
ADD CONSTRAINT "approval_requests_updated_by_organization_id_fkey"
FOREIGN KEY ("updated_by", "organization_id")
REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "approval_actions"
ADD CONSTRAINT "approval_actions_approval_request_id_organization_id_fkey"
FOREIGN KEY ("approval_request_id", "organization_id")
REFERENCES "approval_requests"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "approval_actions"
ADD CONSTRAINT "approval_actions_approval_level_id_organization_id_fkey"
FOREIGN KEY ("approval_level_id", "organization_id")
REFERENCES "approval_levels"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "approval_actions"
ADD CONSTRAINT "approval_actions_approver_user_id_organization_id_fkey"
FOREIGN KEY ("approver_user_id", "organization_id")
REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "approval_actions"
ADD CONSTRAINT "approval_actions_delegated_to_user_id_organization_id_fkey"
FOREIGN KEY ("delegated_to_user_id", "organization_id")
REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "approval_actions"
ADD CONSTRAINT "approval_actions_created_by_organization_id_fkey"
FOREIGN KEY ("created_by", "organization_id")
REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "approval_actions"
ADD CONSTRAINT "approval_actions_updated_by_organization_id_fkey"
FOREIGN KEY ("updated_by", "organization_id")
REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "approval_histories"
ADD CONSTRAINT "approval_histories_approval_request_id_organization_id_fkey"
FOREIGN KEY ("approval_request_id", "organization_id")
REFERENCES "approval_requests"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "approval_histories"
ADD CONSTRAINT "approval_histories_approval_level_id_organization_id_fkey"
FOREIGN KEY ("approval_level_id", "organization_id")
REFERENCES "approval_levels"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "approval_histories"
ADD CONSTRAINT "approval_histories_approval_action_id_organization_id_fkey"
FOREIGN KEY ("approval_action_id", "organization_id")
REFERENCES "approval_actions"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "approval_histories"
ADD CONSTRAINT "approval_histories_performed_by_organization_id_fkey"
FOREIGN KEY ("performed_by", "organization_id")
REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "approval_histories"
ADD CONSTRAINT "approval_histories_created_by_organization_id_fkey"
FOREIGN KEY ("created_by", "organization_id")
REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "approval_delegations"
ADD CONSTRAINT "approval_delegations_delegator_user_id_organization_id_fkey"
FOREIGN KEY ("delegator_user_id", "organization_id")
REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "approval_delegations"
ADD CONSTRAINT "approval_delegations_delegate_user_id_organization_id_fkey"
FOREIGN KEY ("delegate_user_id", "organization_id")
REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "approval_delegations"
ADD CONSTRAINT "approval_delegations_approval_configuration_id_organizatio_fkey"
FOREIGN KEY ("approval_configuration_id", "organization_id")
REFERENCES "approval_configurations"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "approval_delegations"
ADD CONSTRAINT "approval_delegations_approval_level_id_organization_id_fkey"
FOREIGN KEY ("approval_level_id", "organization_id")
REFERENCES "approval_levels"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "approval_delegations"
ADD CONSTRAINT "approval_delegations_created_by_organization_id_fkey"
FOREIGN KEY ("created_by", "organization_id")
REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "approval_delegations"
ADD CONSTRAINT "approval_delegations_updated_by_organization_id_fkey"
FOREIGN KEY ("updated_by", "organization_id")
REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
