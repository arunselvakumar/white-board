-- A Daily Worksheet can name the Task its work is for (CM-806, ADR CM-0019
-- §6). The id points at construction_tracking.tasks without a foreign key
-- (another schema); touches construction_site_work only (ADR-0030).

-- AlterTable
ALTER TABLE "construction_site_work"."worksheets" ADD COLUMN     "task_id" UUID;

-- CreateIndex
CREATE INDEX "worksheets_task_id_idx" ON "construction_site_work"."worksheets"("task_id");
