-- Report jobs (CM-217, CM-218): the reporting context's own schema. A job runs
-- inline until M9 moves it onto a queue; its files live in private storage.
-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "construction_reporting";

-- CreateEnum
CREATE TYPE "construction_reporting"."report_kind" AS ENUM ('labour_attendance', 'labour_payment', 'labour_month', 'vendor_attendance', 'muster_roll');

-- CreateEnum
CREATE TYPE "construction_reporting"."job_status" AS ENUM ('queued', 'running', 'done', 'failed');

-- CreateTable
CREATE TABLE "construction_reporting"."report_jobs" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "project_id" UUID,
    "kind" "construction_reporting"."report_kind" NOT NULL,
    "params" JSONB NOT NULL,
    "status" "construction_reporting"."job_status" NOT NULL DEFAULT 'queued',
    "includes_money" BOOLEAN NOT NULL DEFAULT false,
    "xlsx_key" TEXT,
    "pdf_key" TEXT,
    "file_name" TEXT,
    "error" TEXT,
    "requested_by" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMPTZ(3),
    "finished_at" TIMESTAMPTZ(3),

    CONSTRAINT "report_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "report_jobs_workspace_id_project_id_created_at_idx" ON "construction_reporting"."report_jobs"("workspace_id", "project_id", "created_at");

