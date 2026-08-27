-- CreateTable
CREATE TABLE "activity_logs" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "module" VARCHAR(100) NOT NULL,
    "entity_name" VARCHAR(100) NOT NULL,
    "record_id" VARCHAR(100),
    "action" VARCHAR(100) NOT NULL,
    "ip_address" INET,
    "user_agent" TEXT,
    "device_info" JSONB,
    "performed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "remarks" TEXT,

    CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "activity_logs_user_id_performed_at_idx"
ON "activity_logs"("user_id", "performed_at");

-- CreateIndex
CREATE INDEX "activity_logs_organization_id_performed_at_idx"
ON "activity_logs"("organization_id", "performed_at");

-- CreateIndex
CREATE INDEX "activity_logs_module_performed_at_idx"
ON "activity_logs"("module", "performed_at");

-- CreateIndex
CREATE INDEX "activity_logs_entity_name_performed_at_idx"
ON "activity_logs"("entity_name", "performed_at");

-- CreateIndex
CREATE INDEX "activity_logs_entity_name_record_id_performed_at_idx"
ON "activity_logs"("entity_name", "record_id", "performed_at");

-- CreateIndex
CREATE INDEX "activity_logs_performed_at_idx"
ON "activity_logs"("performed_at");

-- AddForeignKey
ALTER TABLE "activity_logs"
ADD CONSTRAINT "activity_logs_user_id_organization_id_fkey"
FOREIGN KEY ("user_id", "organization_id")
REFERENCES "users"("id", "organization_id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_logs"
ADD CONSTRAINT "activity_logs_organization_id_fkey"
FOREIGN KEY ("organization_id")
REFERENCES "organizations"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
