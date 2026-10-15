-- Tracking masters (CM-801, ADR CM-0019 §1): Issue Categories (menu
-- `masters.issue_categories`) and Tags (menu `masters.tags`). Touches
-- construction_masters only (ADR-0030); the seed rows for existing
-- Companies are the next migration.

-- CreateTable
CREATE TABLE "construction_masters"."issue_categories" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_seed" BOOLEAN NOT NULL DEFAULT false,
    "disabled_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_by" TEXT NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "deleted_by" TEXT,

    CONSTRAINT "issue_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "construction_masters"."tags" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_by" TEXT NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "deleted_by" TEXT,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "issue_categories_workspace_id_idx" ON "construction_masters"."issue_categories"("workspace_id");

-- CreateIndex
CREATE INDEX "tags_workspace_id_idx" ON "construction_masters"."tags"("workspace_id");

-- Names are unique per Company among live rows, any case.
CREATE UNIQUE INDEX "issue_categories_live_name_key" ON "construction_masters"."issue_categories"("workspace_id", lower("name")) WHERE "deleted_at" IS NULL;
CREATE UNIQUE INDEX "tags_live_name_key" ON "construction_masters"."tags"("workspace_id", lower("name")) WHERE "deleted_at" IS NULL;
ALTER TABLE "construction_masters"."issue_categories" ADD CONSTRAINT "issue_categories_name_check" CHECK (length(btrim("name")) > 0);
ALTER TABLE "construction_masters"."tags" ADD CONSTRAINT "tags_name_check" CHECK (length(btrim("name")) > 0);
