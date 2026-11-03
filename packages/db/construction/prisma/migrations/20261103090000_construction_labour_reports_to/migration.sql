-- Reports To on a Labour (ADR CM-0035): the Labour this labourer reports
-- to, optional. Another labourer of the same Company; the application
-- refuses themselves and loops. Deleting a Labour is a tombstone, so the
-- command clears its reports; ON DELETE SET NULL covers a hard delete.
-- Touches no other schema (ADR-0030).

-- AlterTable
ALTER TABLE "construction_labour"."labours" ADD COLUMN     "reports_to_id" UUID;

-- CreateIndex
CREATE INDEX "labours_reports_to_id_idx" ON "construction_labour"."labours"("reports_to_id");

-- AddForeignKey
ALTER TABLE "construction_labour"."labours" ADD CONSTRAINT "labours_reports_to_id_fkey" FOREIGN KEY ("reports_to_id") REFERENCES "construction_labour"."labours"("id") ON DELETE SET NULL ON UPDATE CASCADE;
