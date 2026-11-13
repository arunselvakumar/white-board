-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "construction_marketing";

-- CreateEnum
CREATE TYPE "construction_marketing"."stage" AS ENUM ('new', 'contacted', 'requirement_received', 'quotation_sent', 'negotiation', 'won', 'lost');

-- CreateEnum
CREATE TYPE "construction_marketing"."lost_reason" AS ENUM ('price', 'competitor', 'no_requirement', 'not_reachable', 'other');

-- CreateEnum
CREATE TYPE "construction_marketing"."company_source" AS ENUM ('reference', 'cold_call', 'tender_notice', 'existing_client', 'exhibition', 'online', 'other');

-- CreateTable
CREATE TABLE "construction_marketing"."prospect_companies" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name_key" TEXT NOT NULL,
    "industry" TEXT,
    "address" TEXT,
    "city" TEXT,
    "state_code" TEXT,
    "pin" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "website" TEXT,
    "gstin" TEXT,
    "source" "construction_marketing"."company_source",
    "assigned_member_id" UUID,
    "stage" "construction_marketing"."stage" NOT NULL DEFAULT 'new',
    "lost_reason" "construction_marketing"."lost_reason",
    "lost_reason_text" TEXT,
    "remarks" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_by" TEXT NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "deleted_by" TEXT,

    CONSTRAINT "prospect_companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "construction_marketing"."contacts" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "prospect_company_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "job_title" TEXT,
    "mobile" TEXT,
    "email" TEXT,
    "remarks" TEXT,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_by" TEXT NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "deleted_by" TEXT,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "construction_marketing"."stage_changes" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "prospect_company_id" UUID NOT NULL,
    "from_stage" "construction_marketing"."stage",
    "to_stage" "construction_marketing"."stage" NOT NULL,
    "lost_reason" "construction_marketing"."lost_reason",
    "lost_reason_text" TEXT,
    "changed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changed_by" TEXT NOT NULL,

    CONSTRAINT "stage_changes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "prospect_companies_workspace_id_created_at_idx" ON "construction_marketing"."prospect_companies"("workspace_id", "created_at");

-- CreateIndex
CREATE INDEX "prospect_companies_workspace_id_stage_idx" ON "construction_marketing"."prospect_companies"("workspace_id", "stage");

-- CreateIndex
CREATE INDEX "prospect_companies_workspace_id_assigned_member_id_idx" ON "construction_marketing"."prospect_companies"("workspace_id", "assigned_member_id");

-- CreateIndex
CREATE INDEX "prospect_companies_workspace_id_created_by_idx" ON "construction_marketing"."prospect_companies"("workspace_id", "created_by");

-- CreateIndex
CREATE INDEX "contacts_workspace_id_prospect_company_id_idx" ON "construction_marketing"."contacts"("workspace_id", "prospect_company_id");

-- CreateIndex
CREATE INDEX "contacts_workspace_id_mobile_idx" ON "construction_marketing"."contacts"("workspace_id", "mobile");

-- CreateIndex
CREATE INDEX "stage_changes_workspace_id_prospect_company_id_changed_at_idx" ON "construction_marketing"."stage_changes"("workspace_id", "prospect_company_id", "changed_at");

-- AddForeignKey
ALTER TABLE "construction_marketing"."contacts" ADD CONSTRAINT "contacts_prospect_company_id_fkey" FOREIGN KEY ("prospect_company_id") REFERENCES "construction_marketing"."prospect_companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "construction_marketing"."stage_changes" ADD CONSTRAINT "stage_changes_prospect_company_id_fkey" FOREIGN KEY ("prospect_company_id") REFERENCES "construction_marketing"."prospect_companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- One live Prospect Company per name in a Company, ignoring case and
-- spacing (ADR CM-0040 §5, §6).
CREATE UNIQUE INDEX "prospect_companies_workspace_name_live_key"
    ON "construction_marketing"."prospect_companies" ("workspace_id", "name_key")
    WHERE "deleted_at" IS NULL;

-- At most one live primary Contact per Prospect Company (ADR CM-0040 §6).
CREATE UNIQUE INDEX "contacts_company_primary_live_key"
    ON "construction_marketing"."contacts" ("prospect_company_id")
    WHERE "is_primary" AND "deleted_at" IS NULL;
