-- Sequence rules and their per-fiscal-year counters (CM-114).
-- CreateTable
CREATE TABLE "construction_organization"."sequence_rules" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "project_id" TEXT,
    "prefix" TEXT NOT NULL,
    "project_token" TEXT NOT NULL DEFAULT '',
    "start_number" INTEGER NOT NULL,
    "padding" INTEGER NOT NULL DEFAULT 5,
    "separator" TEXT NOT NULL DEFAULT '/',
    "fiscal_year_token" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_by" TEXT NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "sequence_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "construction_organization"."sequence_counters" (
    "rule_id" UUID NOT NULL,
    "fiscal_year" INTEGER NOT NULL,
    "last_number" INTEGER NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sequence_counters_pkey" PRIMARY KEY ("rule_id","fiscal_year")
);

-- CreateIndex
CREATE INDEX "sequence_rules_workspace_id_module_idx" ON "construction_organization"."sequence_rules"("workspace_id", "module");

-- AddForeignKey
ALTER TABLE "construction_organization"."sequence_counters" ADD CONSTRAINT "sequence_counters_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "construction_organization"."sequence_rules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- One live default rule per module and one live rule per (module, project)
-- (by hand: Prisma cannot express partial indexes). `nextSequenceNumber`
-- relies on the first for ON CONFLICT when it saves a module's standard rule.
CREATE UNIQUE INDEX "sequence_rules_live_default_key" ON "construction_organization"."sequence_rules"("workspace_id", "module") WHERE "project_id" IS NULL AND "deleted_at" IS NULL;
CREATE UNIQUE INDEX "sequence_rules_live_project_key" ON "construction_organization"."sequence_rules"("workspace_id", "module", "project_id") WHERE "project_id" IS NOT NULL AND "deleted_at" IS NULL;

ALTER TABLE "construction_organization"."sequence_rules" ADD CONSTRAINT "sequence_rules_numbers_check" CHECK ("start_number" >= 1 AND "padding" BETWEEN 1 AND 10);
ALTER TABLE "construction_organization"."sequence_counters" ADD CONSTRAINT "sequence_counters_last_number_check" CHECK ("last_number" >= 1);
