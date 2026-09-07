BEGIN;

-- Fail before creating constraints if existing persisted lifecycle values are invalid.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "roles" WHERE "status" NOT IN ('Active', 'Inactive')) THEN
    RAISE EXCEPTION 'Cannot enforce roles status lifecycle: invalid persisted values exist.';
  END IF;
  IF EXISTS (SELECT 1 FROM "permissions" WHERE "status" NOT IN ('Active', 'Inactive')) THEN
    RAISE EXCEPTION 'Cannot enforce permissions status lifecycle: invalid persisted values exist.';
  END IF;
  IF EXISTS (SELECT 1 FROM "role_permissions" WHERE "status" NOT IN ('Active', 'Inactive')) THEN
    RAISE EXCEPTION 'Cannot enforce role_permissions status lifecycle: invalid persisted values exist.';
  END IF;
  IF EXISTS (SELECT 1 FROM "role_assignments" WHERE "status" NOT IN ('Active', 'Inactive', 'Expired', 'Revoked')) THEN
    RAISE EXCEPTION 'Cannot enforce role_assignments status lifecycle: invalid persisted values exist.';
  END IF;
  IF EXISTS (SELECT 1 FROM "approval_configurations" WHERE "approval_mode" NOT IN ('Single', 'Multi Level')) THEN
    RAISE EXCEPTION 'Cannot enforce approval configuration modes: invalid persisted values exist.';
  END IF;
  IF EXISTS (SELECT 1 FROM "approval_configurations" WHERE "submission_status" <> 'Configured') THEN
    RAISE EXCEPTION 'Cannot enforce approval configuration submission status: invalid persisted values exist.';
  END IF;
  IF EXISTS (SELECT 1 FROM "approval_configurations" WHERE "status" NOT IN ('Active', 'Inactive')) THEN
    RAISE EXCEPTION 'Cannot enforce approval configuration status lifecycle: invalid persisted values exist.';
  END IF;
  IF EXISTS (SELECT 1 FROM "approval_levels" WHERE "status" NOT IN ('Active', 'Inactive')) THEN
    RAISE EXCEPTION 'Cannot enforce approval level status lifecycle: invalid persisted values exist.';
  END IF;
  IF EXISTS (SELECT 1 FROM "approval_requests" WHERE "approval_status" NOT IN ('Pending', 'Approved', 'Rejected', 'Returned', 'Cancelled')) THEN
    RAISE EXCEPTION 'Cannot enforce approval request status lifecycle: invalid persisted values exist.';
  END IF;
  IF EXISTS (SELECT 1 FROM "approval_actions" WHERE "status" NOT IN ('Completed', 'Cancelled')) THEN
    RAISE EXCEPTION 'Cannot enforce approval action status lifecycle: invalid persisted values exist.';
  END IF;
  IF EXISTS (SELECT 1 FROM "approval_histories" WHERE "event_type" NOT IN ('Submitted', 'Level Started', 'Approved', 'Rejected', 'Returned', 'Delegated', 'Completed', 'Cancelled')) THEN
    RAISE EXCEPTION 'Cannot enforce approval history event types: invalid persisted values exist.';
  END IF;
  IF EXISTS (SELECT 1 FROM "approval_histories" WHERE "from_status" IS NOT NULL AND "from_status" NOT IN ('Pending', 'Approved', 'Rejected', 'Returned', 'Cancelled')) THEN
    RAISE EXCEPTION 'Cannot enforce approval history from status lifecycle: invalid persisted values exist.';
  END IF;
  IF EXISTS (SELECT 1 FROM "approval_histories" WHERE "to_status" IS NOT NULL AND "to_status" NOT IN ('Pending', 'Approved', 'Rejected', 'Returned', 'Cancelled')) THEN
    RAISE EXCEPTION 'Cannot enforce approval history to status lifecycle: invalid persisted values exist.';
  END IF;
  IF EXISTS (SELECT 1 FROM "approval_delegations" WHERE "status" NOT IN ('Active', 'Expired', 'Cancelled')) THEN
    RAISE EXCEPTION 'Cannot enforce approval delegation status lifecycle: invalid persisted values exist.';
  END IF;
END
$$;

ALTER TABLE "roles"
ADD CONSTRAINT "roles_status_check"
CHECK ("status" IN ('Active', 'Inactive'));

ALTER TABLE "permissions"
ADD CONSTRAINT "permissions_status_check"
CHECK ("status" IN ('Active', 'Inactive'));

ALTER TABLE "role_permissions"
ADD CONSTRAINT "role_permissions_status_check"
CHECK ("status" IN ('Active', 'Inactive'));

ALTER TABLE "role_assignments"
ADD CONSTRAINT "role_assignments_status_check"
CHECK ("status" IN ('Active', 'Inactive', 'Expired', 'Revoked'));

ALTER TABLE "approval_configurations"
ADD CONSTRAINT "approval_configurations_approval_mode_check"
CHECK ("approval_mode" IN ('Single', 'Multi Level')),
ADD CONSTRAINT "approval_configurations_submission_status_check"
CHECK ("submission_status" IN ('Configured')),
ADD CONSTRAINT "approval_configurations_status_check"
CHECK ("status" IN ('Active', 'Inactive'));

ALTER TABLE "approval_levels"
ADD CONSTRAINT "approval_levels_status_check"
CHECK ("status" IN ('Active', 'Inactive'));

ALTER TABLE "approval_requests"
ADD CONSTRAINT "approval_requests_approval_status_check"
CHECK ("approval_status" IN ('Pending', 'Approved', 'Rejected', 'Returned', 'Cancelled'));

ALTER TABLE "approval_actions"
ADD CONSTRAINT "approval_actions_status_check"
CHECK ("status" IN ('Completed', 'Cancelled'));

ALTER TABLE "approval_histories"
ADD CONSTRAINT "approval_histories_event_type_check"
CHECK ("event_type" IN ('Submitted', 'Level Started', 'Approved', 'Rejected', 'Returned', 'Delegated', 'Completed', 'Cancelled')),
ADD CONSTRAINT "approval_histories_from_status_check"
CHECK ("from_status" IS NULL OR "from_status" IN ('Pending', 'Approved', 'Rejected', 'Returned', 'Cancelled')),
ADD CONSTRAINT "approval_histories_to_status_check"
CHECK ("to_status" IS NULL OR "to_status" IN ('Pending', 'Approved', 'Rejected', 'Returned', 'Cancelled'));

ALTER TABLE "approval_delegations"
ADD CONSTRAINT "approval_delegations_status_check"
CHECK ("status" IN ('Active', 'Expired', 'Cancelled'));

COMMIT;
