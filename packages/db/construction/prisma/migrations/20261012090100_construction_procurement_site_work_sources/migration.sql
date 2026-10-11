-- Daily site work (CM-602, CM-604, ADR CM-0016 §5): material lines on
-- Daily Worksheets and Equipment Usage sheets post Consumed entries to the
-- stock ledger with their own source types, so Current Inventory's history
-- links back to the sheet. Touches construction_procurement only (ADR-0030).

-- AlterEnum
ALTER TYPE "construction_procurement"."stock_source" ADD VALUE 'daily_worksheet';
ALTER TYPE "construction_procurement"."stock_source" ADD VALUE 'equipment_usage';
