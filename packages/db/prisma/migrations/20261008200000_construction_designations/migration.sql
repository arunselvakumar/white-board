-- Designations with Permission Templates (CM-106).
-- CreateTable
CREATE TABLE "construction_organization"."designations" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_seed" BOOLEAN NOT NULL DEFAULT false,
    "permission_template" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_by" TEXT NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "designations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "designations_workspace_id_idx" ON "construction_organization"."designations"("workspace_id");

-- One live Designation per name per Company (written by hand: Prisma cannot
-- express a partial index).
CREATE UNIQUE INDEX "designations_live_name_key" ON "construction_organization"."designations"("workspace_id", lower("name")) WHERE "deleted_at" IS NULL;
