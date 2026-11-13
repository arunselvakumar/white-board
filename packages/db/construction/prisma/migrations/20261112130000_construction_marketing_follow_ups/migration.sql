-- CreateEnum
CREATE TYPE "construction_marketing"."follow_up_type" AS ENUM ('call', 'visit', 'email', 'send_quotation', 'other');

-- CreateEnum
CREATE TYPE "construction_marketing"."follow_up_status" AS ENUM ('open', 'done', 'cancelled');

-- CreateTable
CREATE TABLE "construction_marketing"."follow_ups" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "prospect_company_id" UUID NOT NULL,
    "visit_id" UUID,
    "type" "construction_marketing"."follow_up_type" NOT NULL,
    "due_date" DATE NOT NULL,
    "owner_member_id" UUID NOT NULL,
    "note" TEXT,
    "status" "construction_marketing"."follow_up_status" NOT NULL DEFAULT 'open',
    "result_note" TEXT,
    "done_on" DATE,
    "done_at" TIMESTAMPTZ(3),
    "done_by" TEXT,
    "cancelled_at" TIMESTAMPTZ(3),
    "cancelled_by" TEXT,
    "due_notified_on" DATE,
    "overdue_notified_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_by" TEXT NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "deleted_by" TEXT,

    CONSTRAINT "follow_ups_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "follow_ups_workspace_id_status_due_date_idx" ON "construction_marketing"."follow_ups"("workspace_id", "status", "due_date");

-- CreateIndex
CREATE INDEX "follow_ups_workspace_id_owner_member_id_status_idx" ON "construction_marketing"."follow_ups"("workspace_id", "owner_member_id", "status");

-- CreateIndex
CREATE INDEX "follow_ups_workspace_id_prospect_company_id_idx" ON "construction_marketing"."follow_ups"("workspace_id", "prospect_company_id");

-- CreateIndex
CREATE INDEX "follow_ups_workspace_id_created_by_idx" ON "construction_marketing"."follow_ups"("workspace_id", "created_by");

-- AddForeignKey
ALTER TABLE "construction_marketing"."follow_ups" ADD CONSTRAINT "follow_ups_prospect_company_id_fkey" FOREIGN KEY ("prospect_company_id") REFERENCES "construction_marketing"."prospect_companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "construction_marketing"."follow_ups" ADD CONSTRAINT "follow_ups_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "construction_marketing"."visits"("id") ON DELETE SET NULL ON UPDATE CASCADE;
