-- Technical optimistic-concurrency token for Approval decisions.
ALTER TABLE "approval_requests"
ADD COLUMN "decision_version" INTEGER NOT NULL DEFAULT 0;
