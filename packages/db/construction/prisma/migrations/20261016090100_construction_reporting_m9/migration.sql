-- M9 reporting (ADR CM-0021 §3, §5, §8): the `expired` job status for
-- retention, the procurement and central labour report kinds, and backup
-- jobs (project, masters, Company, Download My Data).

-- CreateEnum
CREATE TYPE "construction_reporting"."backup_scope" AS ENUM ('project', 'masters', 'company', 'my_data');

-- AlterEnum
ALTER TYPE "construction_reporting"."job_status" ADD VALUE 'expired';

-- AlterEnum
ALTER TYPE "construction_reporting"."report_kind" ADD VALUE 'purchase_requests';
ALTER TYPE "construction_reporting"."report_kind" ADD VALUE 'purchase_orders';
ALTER TYPE "construction_reporting"."report_kind" ADD VALUE 'material_received';
ALTER TYPE "construction_reporting"."report_kind" ADD VALUE 'material_transfers';
ALTER TYPE "construction_reporting"."report_kind" ADD VALUE 'stock_register';
ALTER TYPE "construction_reporting"."report_kind" ADD VALUE 'labour_attendance_central';

-- CreateTable
CREATE TABLE "construction_reporting"."backup_jobs" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT,
    "project_id" UUID,
    "scope" "construction_reporting"."backup_scope" NOT NULL,
    "modules" TEXT[],
    "from_date" DATE,
    "to_date" DATE,
    "include_data" BOOLEAN NOT NULL DEFAULT true,
    "include_media" BOOLEAN NOT NULL DEFAULT false,
    "includes_money" BOOLEAN NOT NULL DEFAULT false,
    "status" "construction_reporting"."job_status" NOT NULL DEFAULT 'queued',
    "parts" JSONB NOT NULL DEFAULT '[]',
    "file_key" TEXT,
    "file_name" TEXT,
    "bytes" BIGINT,
    "error" TEXT,
    "requested_by" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMPTZ(3),
    "finished_at" TIMESTAMPTZ(3),
    "expires_at" TIMESTAMPTZ(3),

    CONSTRAINT "backup_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "backup_jobs_workspace_id_requested_by_created_at_idx" ON "construction_reporting"."backup_jobs"("workspace_id", "requested_by", "created_at");

-- CreateIndex
CREATE INDEX "backup_jobs_requested_by_created_at_idx" ON "construction_reporting"."backup_jobs"("requested_by", "created_at");

-- CreateIndex
CREATE INDEX "report_jobs_workspace_id_requested_by_created_at_idx" ON "construction_reporting"."report_jobs"("workspace_id", "requested_by", "created_at");

ALTER TABLE "construction_reporting"."backup_jobs" ADD CONSTRAINT "backup_jobs_scope_check" CHECK (
  ("scope" = 'project' AND "workspace_id" IS NOT NULL AND "project_id" IS NOT NULL)
  OR ("scope" IN ('masters', 'company') AND "workspace_id" IS NOT NULL AND "project_id" IS NULL)
  OR ("scope" = 'my_data' AND "project_id" IS NULL)
);

ALTER TABLE "construction_reporting"."backup_jobs" ADD CONSTRAINT "backup_jobs_period_check" CHECK ("from_date" IS NULL OR "to_date" IS NULL OR "from_date" <= "to_date");
