-- Append-only audit trail for Construction Management (CM-008).
-- CreateTable
CREATE TABLE "construction_organization"."audit_events" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "actor_user_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_events_workspace_id_entity_type_entity_id_idx" ON "construction_organization"."audit_events"("workspace_id", "entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_events_workspace_id_occurred_at_idx" ON "construction_organization"."audit_events"("workspace_id", "occurred_at");
