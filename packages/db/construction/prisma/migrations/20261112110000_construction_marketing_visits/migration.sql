-- CreateEnum
CREATE TYPE "construction_marketing"."visit_status" AS ENUM ('planned', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "construction_marketing"."visit_purpose" AS ENUM ('cold_call', 'introduction', 'requirement_discussion', 'quotation', 'negotiation', 'relationship', 'payment_follow_up', 'other');

-- CreateEnum
CREATE TYPE "construction_marketing"."interest" AS ENUM ('hot', 'warm', 'cold');

-- CreateEnum
CREATE TYPE "construction_marketing"."work_type" AS ENUM ('civil', 'peb', 'steel_fabrication', 'shed_erection', 'other');

-- CreateTable
CREATE TABLE "construction_marketing"."visits" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "prospect_company_id" UUID NOT NULL,
    "visit_at" TIMESTAMPTZ(3) NOT NULL,
    "status" "construction_marketing"."visit_status" NOT NULL DEFAULT 'planned',
    "purpose" "construction_marketing"."visit_purpose",
    "location" TEXT,
    "discussion" TEXT,
    "outcome" TEXT,
    "interest" "construction_marketing"."interest",
    "requirement_work_type" "construction_marketing"."work_type",
    "requirement_value" BIGINT,
    "requirement_start_month" DATE,
    "completed_at" TIMESTAMPTZ(3),
    "completed_by" TEXT,
    "cancel_reason" TEXT,
    "cancelled_at" TIMESTAMPTZ(3),
    "cancelled_by" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_by" TEXT NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "deleted_by" TEXT,

    CONSTRAINT "visits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "construction_marketing"."visit_visitors" (
    "workspace_id" TEXT NOT NULL,
    "visit_id" UUID NOT NULL,
    "member_id" UUID NOT NULL,

    CONSTRAINT "visit_visitors_pkey" PRIMARY KEY ("visit_id","member_id")
);

-- CreateTable
CREATE TABLE "construction_marketing"."visit_contacts" (
    "workspace_id" TEXT NOT NULL,
    "visit_id" UUID NOT NULL,
    "contact_id" UUID NOT NULL,

    CONSTRAINT "visit_contacts_pkey" PRIMARY KEY ("visit_id","contact_id")
);

-- CreateTable
CREATE TABLE "construction_marketing"."visit_notes" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "visit_id" UUID NOT NULL,
    "text" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,

    CONSTRAINT "visit_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "visits_workspace_id_visit_at_idx" ON "construction_marketing"."visits"("workspace_id", "visit_at");

-- CreateIndex
CREATE INDEX "visits_workspace_id_prospect_company_id_visit_at_idx" ON "construction_marketing"."visits"("workspace_id", "prospect_company_id", "visit_at");

-- CreateIndex
CREATE INDEX "visits_workspace_id_created_by_idx" ON "construction_marketing"."visits"("workspace_id", "created_by");

-- CreateIndex
CREATE UNIQUE INDEX "visits_workspace_id_number_key" ON "construction_marketing"."visits"("workspace_id", "number");

-- CreateIndex
CREATE INDEX "visit_visitors_workspace_id_member_id_idx" ON "construction_marketing"."visit_visitors"("workspace_id", "member_id");

-- CreateIndex
CREATE INDEX "visit_contacts_workspace_id_contact_id_idx" ON "construction_marketing"."visit_contacts"("workspace_id", "contact_id");

-- CreateIndex
CREATE INDEX "visit_notes_workspace_id_visit_id_created_at_idx" ON "construction_marketing"."visit_notes"("workspace_id", "visit_id", "created_at");

-- AddForeignKey
ALTER TABLE "construction_marketing"."visits" ADD CONSTRAINT "visits_prospect_company_id_fkey" FOREIGN KEY ("prospect_company_id") REFERENCES "construction_marketing"."prospect_companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "construction_marketing"."visit_visitors" ADD CONSTRAINT "visit_visitors_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "construction_marketing"."visits"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "construction_marketing"."visit_contacts" ADD CONSTRAINT "visit_contacts_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "construction_marketing"."visits"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "construction_marketing"."visit_contacts" ADD CONSTRAINT "visit_contacts_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "construction_marketing"."contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "construction_marketing"."visit_notes" ADD CONSTRAINT "visit_notes_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "construction_marketing"."visits"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
