-- Back-dated Entry policy, one row per Company (CM-113).
-- CreateTable
CREATE TABLE "construction_organization"."backdated_entry_policies" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "create_days" INTEGER NOT NULL,
    "create_override_designation_ids" UUID[],
    "edit_days" INTEGER NOT NULL,
    "edit_override_designation_ids" UUID[],
    "financial_closing_date" DATE,
    "modules" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_by" TEXT NOT NULL,

    CONSTRAINT "backdated_entry_policies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "backdated_entry_policies_workspace_id_key" ON "construction_organization"."backdated_entry_policies"("workspace_id");

-- Days are 0 (no restriction) or more (by hand: Prisma cannot express checks).
ALTER TABLE "construction_organization"."backdated_entry_policies" ADD CONSTRAINT "backdated_entry_policies_days_check" CHECK ("create_days" >= 0 AND "edit_days" >= 0);
