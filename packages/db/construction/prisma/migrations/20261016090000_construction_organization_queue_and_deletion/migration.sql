-- M9 kernel tables in construction_organization (ADR CM-0021):
-- the Postgres job queue (§1), action codes for sensitive actions (§8, §10,
-- §11), Company and account deletion records (§10), and the `left` Team
-- Member status. Touches no other schema.

-- CreateEnum
CREATE TYPE "construction_organization"."queue_job_status" AS ENUM ('queued', 'running', 'done', 'failed');

-- CreateEnum
CREATE TYPE "construction_organization"."action_code_purpose" AS ENUM ('company_backup', 'transfer_ownership', 'delete_account', 'delete_company', 'reveal_identifiers');

-- AlterEnum
ALTER TYPE "construction_organization"."team_member_status" ADD VALUE 'left';

-- CreateTable
CREATE TABLE "construction_organization"."queue_jobs" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "construction_organization"."queue_job_status" NOT NULL DEFAULT 'queued',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 3,
    "run_after" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lease_until" TIMESTAMPTZ(3),
    "last_error" TEXT,
    "dedupe_key" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMPTZ(3),
    "finished_at" TIMESTAMPTZ(3),

    CONSTRAINT "queue_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "construction_organization"."action_codes" (
    "id" UUID NOT NULL,
    "user_id" TEXT NOT NULL,
    "workspace_id" TEXT,
    "session_id" TEXT,
    "purpose" "construction_organization"."action_code_purpose" NOT NULL,
    "code_hash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "consumed_at" TIMESTAMPTZ(3),
    "verified_until" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "action_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "construction_organization"."company_deletions" (
    "id" UUID NOT NULL,
    "deleted_workspace_id" TEXT NOT NULL,
    "company_name" TEXT NOT NULL,
    "owner_user_id" TEXT NOT NULL,
    "requested_at" TIMESTAMPTZ(3) NOT NULL,
    "scheduled_for" TIMESTAMPTZ(3) NOT NULL,
    "cancelled_at" TIMESTAMPTZ(3),
    "cancelled_by" TEXT,
    "completed_at" TIMESTAMPTZ(3),
    "summary" JSONB,

    CONSTRAINT "company_deletions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "construction_organization"."account_deletions" (
    "id" UUID NOT NULL,
    "user_id" TEXT NOT NULL,
    "reason" TEXT,
    "deleted_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "account_deletions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "queue_jobs_status_run_after_idx" ON "construction_organization"."queue_jobs"("status", "run_after");

-- CreateIndex
CREATE INDEX "queue_jobs_status_lease_until_idx" ON "construction_organization"."queue_jobs"("status", "lease_until");

-- CreateIndex
CREATE INDEX "action_codes_user_id_purpose_created_at_idx" ON "construction_organization"."action_codes"("user_id", "purpose", "created_at");

-- CreateIndex
CREATE INDEX "company_deletions_deleted_workspace_id_idx" ON "construction_organization"."company_deletions"("deleted_workspace_id");

-- CreateIndex
CREATE INDEX "company_deletions_scheduled_for_idx" ON "construction_organization"."company_deletions"("scheduled_for");

-- CreateIndex
CREATE INDEX "account_deletions_user_id_idx" ON "construction_organization"."account_deletions"("user_id");

-- At most one unfinished job per dedupe key.
CREATE UNIQUE INDEX "queue_jobs_dedupe_key_unfinished_key" ON "construction_organization"."queue_jobs"("dedupe_key") WHERE "dedupe_key" IS NOT NULL AND "status" IN ('queued', 'running');

ALTER TABLE "construction_organization"."queue_jobs" ADD CONSTRAINT "queue_jobs_attempts_check" CHECK ("attempts" >= 0 AND "max_attempts" >= 1);

-- One pending (not cancelled, not completed) deletion per Company.
CREATE UNIQUE INDEX "company_deletions_pending_key" ON "construction_organization"."company_deletions"("deleted_workspace_id") WHERE "cancelled_at" IS NULL AND "completed_at" IS NULL;
