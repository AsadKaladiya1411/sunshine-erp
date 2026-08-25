-- Extend users with temporary account-lock persistence.
ALTER TABLE "users"
ADD COLUMN "failed_login_attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "locked_until" TIMESTAMPTZ(6);

ALTER TABLE "users"
ADD CONSTRAINT "users_failed_login_attempts_check"
CHECK ("failed_login_attempts" >= 0),
ADD CONSTRAINT "users_status_check"
CHECK ("status" IN ('Active', 'Inactive', 'Disabled'));

-- Add the approved organization-level concurrent-session setting.
ALTER TABLE "organization_settings"
ADD COLUMN "max_concurrent_sessions" INTEGER NOT NULL DEFAULT 5;

ALTER TABLE "organization_settings"
ADD CONSTRAINT "organization_settings_max_concurrent_sessions_check"
CHECK ("max_concurrent_sessions" > 0);

-- Stage tenant scoping for existing sessions without destroying history.
ALTER TABLE "user_sessions"
ADD COLUMN "organization_id" UUID,
ADD COLUMN "current_token_issued_at" TIMESTAMPTZ(6),
ADD COLUMN "revoked_at" TIMESTAMPTZ(6),
ADD COLUMN "revocation_reason" VARCHAR(50);

UPDATE "user_sessions" AS "session"
SET
  "organization_id" = "user"."organization_id",
  "current_token_issued_at" = "session"."login_at"
FROM "users" AS "user"
WHERE "user"."id" = "session"."user_id";

ALTER TABLE "user_sessions"
ALTER COLUMN "organization_id" SET NOT NULL,
ALTER COLUMN "current_token_issued_at" SET DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "current_token_issued_at" SET NOT NULL;

ALTER TABLE "user_sessions"
ADD CONSTRAINT "user_sessions_status_check"
CHECK ("status" IN ('Active', 'LoggedOut', 'Expired', 'Revoked', 'Compromised'));

-- Store immutable password history for password-reuse enforcement.
CREATE TABLE "user_password_history" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "password_hash" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "user_password_history_pkey" PRIMARY KEY ("id")
);

-- Store only hashed, single-use password-reset credentials.
CREATE TABLE "password_reset_tokens" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "token_hash" TEXT NOT NULL,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "used_at" TIMESTAMPTZ(6),
  "revoked_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "password_reset_tokens_terminal_state_check"
    CHECK ("used_at" IS NULL OR "revoked_at" IS NULL)
);

-- Preserve retired refresh-token hashes for rotation and reuse detection.
CREATE TABLE "user_session_token_history" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "user_session_id" UUID NOT NULL,
  "token_hash" TEXT NOT NULL,
  "issued_at" TIMESTAMPTZ(6) NOT NULL,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "retired_at" TIMESTAMPTZ(6) NOT NULL,
  "retirement_reason" VARCHAR(30) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "user_session_token_history_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "user_session_token_history_retirement_reason_check"
    CHECK ("retirement_reason" IN ('Rotated', 'LoggedOut', 'Expired', 'Revoked', 'Compromised'))
);

CREATE UNIQUE INDEX "users_id_organization_id_key"
ON "users"("id", "organization_id");

CREATE INDEX "users_organization_id_status_locked_until_idx"
ON "users"("organization_id", "status", "locked_until");

CREATE UNIQUE INDEX "user_sessions_id_organization_id_key"
ON "user_sessions"("id", "organization_id");

CREATE INDEX "user_sessions_organization_id_user_id_status_expires_at_idx"
ON "user_sessions"("organization_id", "user_id", "status", "expires_at");

CREATE INDEX "user_sessions_organization_id_status_expires_at_idx"
ON "user_sessions"("organization_id", "status", "expires_at");

CREATE INDEX "user_password_history_organization_id_user_id_created_at_idx"
ON "user_password_history"("organization_id", "user_id", "created_at" DESC);

CREATE UNIQUE INDEX "password_reset_tokens_token_hash_key"
ON "password_reset_tokens"("token_hash");

CREATE INDEX "password_reset_tokens_organization_id_user_id_created_at_idx"
ON "password_reset_tokens"("organization_id", "user_id", "created_at" DESC);

CREATE INDEX "password_reset_tokens_expires_at_idx"
ON "password_reset_tokens"("expires_at");

CREATE UNIQUE INDEX "password_reset_tokens_one_unresolved_per_user_idx"
ON "password_reset_tokens"("organization_id", "user_id")
WHERE "used_at" IS NULL AND "revoked_at" IS NULL;

CREATE UNIQUE INDEX "user_session_token_history_token_hash_key"
ON "user_session_token_history"("token_hash");

CREATE INDEX "user_session_token_history_organization_id_user_session_id__idx"
ON "user_session_token_history"("organization_id", "user_session_id", "retired_at" DESC);

CREATE INDEX "user_session_token_history_organization_id_token_hash_idx"
ON "user_session_token_history"("organization_id", "token_hash");

ALTER TABLE "user_sessions"
DROP CONSTRAINT "user_sessions_user_id_fkey";

DROP INDEX "user_sessions_user_id_idx";

ALTER TABLE "user_sessions"
ADD CONSTRAINT "user_sessions_user_id_organization_id_fkey"
FOREIGN KEY ("user_id", "organization_id")
REFERENCES "users"("id", "organization_id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "user_password_history"
ADD CONSTRAINT "user_password_history_user_id_organization_id_fkey"
FOREIGN KEY ("user_id", "organization_id")
REFERENCES "users"("id", "organization_id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "password_reset_tokens"
ADD CONSTRAINT "password_reset_tokens_user_id_organization_id_fkey"
FOREIGN KEY ("user_id", "organization_id")
REFERENCES "users"("id", "organization_id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "user_session_token_history"
ADD CONSTRAINT "user_session_token_history_user_session_id_organization_id_fkey"
FOREIGN KEY ("user_session_id", "organization_id")
REFERENCES "user_sessions"("id", "organization_id")
ON DELETE RESTRICT ON UPDATE CASCADE;
