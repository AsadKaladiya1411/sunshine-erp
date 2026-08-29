-- CreateTable
CREATE TABLE "approval_configurations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "configuration_code" VARCHAR(50) NOT NULL,
    "configuration_name" VARCHAR(150) NOT NULL,
    "module_name" VARCHAR(100) NOT NULL,
    "entity_name" VARCHAR(100) NOT NULL,
    "approval_required" BOOLEAN NOT NULL DEFAULT true,
    "approval_mode" VARCHAR(30) NOT NULL,
    "submission_status" VARCHAR(30) NOT NULL,
    "status" VARCHAR(30) NOT NULL,
    "remarks" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approval_configurations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_levels" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "approval_configuration_id" UUID NOT NULL,
    "level_number" INTEGER NOT NULL,
    "level_name" VARCHAR(100) NOT NULL,
    "approver_type" VARCHAR(30) NOT NULL,
    "approver_user_id" UUID,
    "approver_role_id" UUID,
    "is_required" BOOLEAN NOT NULL DEFAULT true,
    "auto_approve" BOOLEAN NOT NULL DEFAULT false,
    "status" VARCHAR(30) NOT NULL,
    "remarks" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approval_levels_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "approval_levels_level_number_check" CHECK ("level_number" > 0),
    CONSTRAINT "approval_levels_approver_source_check" CHECK (
        ("approver_type" = 'User' AND "approver_user_id" IS NOT NULL AND "approver_role_id" IS NULL)
        OR
        ("approver_type" = 'Role' AND "approver_role_id" IS NOT NULL AND "approver_user_id" IS NULL)
    )
);

-- CreateTable
CREATE TABLE "approval_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "approval_configuration_id" UUID NOT NULL,
    "approval_number" VARCHAR(50) NOT NULL,
    "target_module" VARCHAR(100) NOT NULL,
    "target_entity" VARCHAR(100) NOT NULL,
    "target_record_id" UUID NOT NULL,
    "requested_by" UUID NOT NULL,
    "requested_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "current_level_id" UUID,
    "approval_status" VARCHAR(30) NOT NULL,
    "submitted_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "remarks" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approval_requests_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "approval_requests_completion_time_check" CHECK (
        "completed_at" IS NULL
        OR "submitted_at" IS NULL
        OR "completed_at" >= "submitted_at"
    )
);

-- CreateTable
CREATE TABLE "approval_actions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "approval_request_id" UUID NOT NULL,
    "approval_level_id" UUID NOT NULL,
    "approver_user_id" UUID NOT NULL,
    "action_type" VARCHAR(30) NOT NULL,
    "action_date" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "comments" TEXT,
    "rejection_reason" TEXT,
    "return_reason" TEXT,
    "delegated_to_user_id" UUID,
    "status" VARCHAR(30) NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approval_actions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "approval_actions_action_type_check" CHECK (
        "action_type" IN ('Approve', 'Reject', 'Return', 'Delegate')
    ),
    CONSTRAINT "approval_actions_rejection_reason_check" CHECK (
        "action_type" <> 'Reject' OR "rejection_reason" IS NOT NULL
    ),
    CONSTRAINT "approval_actions_return_reason_check" CHECK (
        "action_type" <> 'Return' OR "return_reason" IS NOT NULL
    ),
    CONSTRAINT "approval_actions_delegated_user_check" CHECK (
        "action_type" <> 'Delegate' OR "delegated_to_user_id" IS NOT NULL
    )
);

-- CreateTable
CREATE TABLE "approval_histories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "approval_request_id" UUID NOT NULL,
    "approval_level_id" UUID,
    "approval_action_id" UUID,
    "event_type" VARCHAR(40) NOT NULL,
    "from_status" VARCHAR(30),
    "to_status" VARCHAR(30),
    "performed_by" UUID,
    "event_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT,
    "remarks" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approval_histories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_delegations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "delegator_user_id" UUID NOT NULL,
    "delegate_user_id" UUID NOT NULL,
    "approval_configuration_id" UUID,
    "approval_level_id" UUID,
    "effective_from" TIMESTAMPTZ(6) NOT NULL,
    "effective_to" TIMESTAMPTZ(6),
    "reason" TEXT,
    "status" VARCHAR(30) NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approval_delegations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "approval_delegations_different_users_check" CHECK (
        "delegate_user_id" <> "delegator_user_id"
    ),
    CONSTRAINT "approval_delegations_effective_period_check" CHECK (
        "effective_to" IS NULL OR "effective_to" >= "effective_from"
    )
);

-- CreateIndex
CREATE UNIQUE INDEX "approval_configurations_organization_id_configuration_code_key" ON "approval_configurations"("organization_id", "configuration_code");
CREATE INDEX "approval_configurations_organization_id_idx" ON "approval_configurations"("organization_id");
CREATE INDEX "approval_configurations_configuration_code_idx" ON "approval_configurations"("configuration_code");
CREATE INDEX "approval_configurations_module_name_idx" ON "approval_configurations"("module_name");
CREATE INDEX "approval_configurations_entity_name_idx" ON "approval_configurations"("entity_name");
CREATE INDEX "approval_configurations_approval_required_idx" ON "approval_configurations"("approval_required");
CREATE INDEX "approval_configurations_approval_mode_idx" ON "approval_configurations"("approval_mode");
CREATE INDEX "approval_configurations_status_idx" ON "approval_configurations"("status");

CREATE UNIQUE INDEX "approval_levels_approval_configuration_id_level_number_key" ON "approval_levels"("approval_configuration_id", "level_number");
CREATE INDEX "approval_levels_approval_configuration_id_idx" ON "approval_levels"("approval_configuration_id");
CREATE INDEX "approval_levels_level_number_idx" ON "approval_levels"("level_number");
CREATE INDEX "approval_levels_approver_type_idx" ON "approval_levels"("approver_type");
CREATE INDEX "approval_levels_approver_user_id_idx" ON "approval_levels"("approver_user_id");
CREATE INDEX "approval_levels_approver_role_id_idx" ON "approval_levels"("approver_role_id");
CREATE INDEX "approval_levels_status_idx" ON "approval_levels"("status");

CREATE UNIQUE INDEX "approval_requests_organization_id_approval_number_key" ON "approval_requests"("organization_id", "approval_number");
CREATE INDEX "approval_requests_organization_id_idx" ON "approval_requests"("organization_id");
CREATE INDEX "approval_requests_approval_configuration_id_idx" ON "approval_requests"("approval_configuration_id");
CREATE INDEX "approval_requests_approval_number_idx" ON "approval_requests"("approval_number");
CREATE INDEX "approval_requests_target_module_idx" ON "approval_requests"("target_module");
CREATE INDEX "approval_requests_target_entity_idx" ON "approval_requests"("target_entity");
CREATE INDEX "approval_requests_target_record_id_idx" ON "approval_requests"("target_record_id");
CREATE INDEX "approval_requests_requested_by_idx" ON "approval_requests"("requested_by");
CREATE INDEX "approval_requests_current_level_id_idx" ON "approval_requests"("current_level_id");
CREATE INDEX "approval_requests_approval_status_idx" ON "approval_requests"("approval_status");
CREATE INDEX "approval_requests_requested_at_idx" ON "approval_requests"("requested_at");
CREATE INDEX "approval_requests_submitted_at_idx" ON "approval_requests"("submitted_at");

CREATE INDEX "approval_actions_approval_request_id_idx" ON "approval_actions"("approval_request_id");
CREATE INDEX "approval_actions_approval_level_id_idx" ON "approval_actions"("approval_level_id");
CREATE INDEX "approval_actions_approver_user_id_idx" ON "approval_actions"("approver_user_id");
CREATE INDEX "approval_actions_action_type_idx" ON "approval_actions"("action_type");
CREATE INDEX "approval_actions_action_date_idx" ON "approval_actions"("action_date");
CREATE INDEX "approval_actions_delegated_to_user_id_idx" ON "approval_actions"("delegated_to_user_id");
CREATE INDEX "approval_actions_status_idx" ON "approval_actions"("status");

CREATE INDEX "approval_histories_approval_request_id_idx" ON "approval_histories"("approval_request_id");
CREATE INDEX "approval_histories_approval_level_id_idx" ON "approval_histories"("approval_level_id");
CREATE INDEX "approval_histories_approval_action_id_idx" ON "approval_histories"("approval_action_id");
CREATE INDEX "approval_histories_event_type_idx" ON "approval_histories"("event_type");
CREATE INDEX "approval_histories_performed_by_idx" ON "approval_histories"("performed_by");
CREATE INDEX "approval_histories_event_at_idx" ON "approval_histories"("event_at");
CREATE INDEX "approval_histories_from_status_idx" ON "approval_histories"("from_status");
CREATE INDEX "approval_histories_to_status_idx" ON "approval_histories"("to_status");

CREATE INDEX "approval_delegations_organization_id_idx" ON "approval_delegations"("organization_id");
CREATE INDEX "approval_delegations_delegator_user_id_idx" ON "approval_delegations"("delegator_user_id");
CREATE INDEX "approval_delegations_delegate_user_id_idx" ON "approval_delegations"("delegate_user_id");
CREATE INDEX "approval_delegations_approval_configuration_id_idx" ON "approval_delegations"("approval_configuration_id");
CREATE INDEX "approval_delegations_approval_level_id_idx" ON "approval_delegations"("approval_level_id");
CREATE INDEX "approval_delegations_effective_from_idx" ON "approval_delegations"("effective_from");
CREATE INDEX "approval_delegations_effective_to_idx" ON "approval_delegations"("effective_to");
CREATE INDEX "approval_delegations_status_idx" ON "approval_delegations"("status");

-- AddForeignKey
ALTER TABLE "approval_configurations" ADD CONSTRAINT "approval_configurations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "approval_configurations" ADD CONSTRAINT "approval_configurations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "approval_configurations" ADD CONSTRAINT "approval_configurations_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "approval_levels" ADD CONSTRAINT "approval_levels_approval_configuration_id_fkey" FOREIGN KEY ("approval_configuration_id") REFERENCES "approval_configurations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "approval_levels" ADD CONSTRAINT "approval_levels_approver_user_id_fkey" FOREIGN KEY ("approver_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "approval_levels" ADD CONSTRAINT "approval_levels_approver_role_id_fkey" FOREIGN KEY ("approver_role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "approval_levels" ADD CONSTRAINT "approval_levels_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "approval_levels" ADD CONSTRAINT "approval_levels_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_approval_configuration_id_fkey" FOREIGN KEY ("approval_configuration_id") REFERENCES "approval_configurations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_current_level_id_fkey" FOREIGN KEY ("current_level_id") REFERENCES "approval_levels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "approval_actions" ADD CONSTRAINT "approval_actions_approval_request_id_fkey" FOREIGN KEY ("approval_request_id") REFERENCES "approval_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "approval_actions" ADD CONSTRAINT "approval_actions_approval_level_id_fkey" FOREIGN KEY ("approval_level_id") REFERENCES "approval_levels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "approval_actions" ADD CONSTRAINT "approval_actions_approver_user_id_fkey" FOREIGN KEY ("approver_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "approval_actions" ADD CONSTRAINT "approval_actions_delegated_to_user_id_fkey" FOREIGN KEY ("delegated_to_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "approval_actions" ADD CONSTRAINT "approval_actions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "approval_actions" ADD CONSTRAINT "approval_actions_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "approval_histories" ADD CONSTRAINT "approval_histories_approval_request_id_fkey" FOREIGN KEY ("approval_request_id") REFERENCES "approval_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "approval_histories" ADD CONSTRAINT "approval_histories_approval_level_id_fkey" FOREIGN KEY ("approval_level_id") REFERENCES "approval_levels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "approval_histories" ADD CONSTRAINT "approval_histories_approval_action_id_fkey" FOREIGN KEY ("approval_action_id") REFERENCES "approval_actions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "approval_histories" ADD CONSTRAINT "approval_histories_performed_by_fkey" FOREIGN KEY ("performed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "approval_histories" ADD CONSTRAINT "approval_histories_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "approval_delegations" ADD CONSTRAINT "approval_delegations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "approval_delegations" ADD CONSTRAINT "approval_delegations_delegator_user_id_fkey" FOREIGN KEY ("delegator_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "approval_delegations" ADD CONSTRAINT "approval_delegations_delegate_user_id_fkey" FOREIGN KEY ("delegate_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "approval_delegations" ADD CONSTRAINT "approval_delegations_approval_configuration_id_fkey" FOREIGN KEY ("approval_configuration_id") REFERENCES "approval_configurations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "approval_delegations" ADD CONSTRAINT "approval_delegations_approval_level_id_fkey" FOREIGN KEY ("approval_level_id") REFERENCES "approval_levels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "approval_delegations" ADD CONSTRAINT "approval_delegations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "approval_delegations" ADD CONSTRAINT "approval_delegations_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
