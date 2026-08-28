-- CreateTable
CREATE TABLE "outbox_events" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "event_type" VARCHAR(200) NOT NULL,
    "event_version" INTEGER NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "organization_id" UUID,
    "aggregate_type" VARCHAR(100),
    "aggregate_id" UUID,
    "actor_id" UUID,
    "correlation_id" VARCHAR(255) NOT NULL,
    "causation_id" VARCHAR(255),
    "payload" JSONB NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'Pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "available_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_at" TIMESTAMPTZ(6),
    "last_error" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "outbox_events_event_version_check"
        CHECK ("event_version" > 0),
    CONSTRAINT "outbox_events_attempts_check"
        CHECK ("attempts" >= 0),
    CONSTRAINT "outbox_events_status_check"
        CHECK ("status" IN ('Pending', 'Published')),
    CONSTRAINT "outbox_events_aggregate_identity_check"
        CHECK (
            ("aggregate_type" IS NULL AND "aggregate_id" IS NULL)
            OR
            ("aggregate_type" IS NOT NULL AND "aggregate_id" IS NOT NULL)
        ),
    CONSTRAINT "outbox_events_publication_state_check"
        CHECK (
            ("status" = 'Pending' AND "published_at" IS NULL)
            OR
            ("status" = 'Published' AND "published_at" IS NOT NULL)
        )
);

-- CreateIndex
CREATE UNIQUE INDEX "outbox_events_event_id_key" ON "outbox_events"("event_id");

-- CreateIndex
CREATE INDEX "outbox_events_pending_poll_idx" ON "outbox_events"("status", "available_at", "occurred_at", "created_at", "event_id");

-- CreateIndex
CREATE INDEX "outbox_events_organization_id_occurred_at_idx" ON "outbox_events"("organization_id", "occurred_at");

-- CreateIndex
CREATE INDEX "outbox_events_aggregate_type_aggregate_id_occurred_at_idx" ON "outbox_events"("aggregate_type", "aggregate_id", "occurred_at");

-- CreateIndex
CREATE INDEX "outbox_events_correlation_id_idx" ON "outbox_events"("correlation_id");
