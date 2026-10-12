-- Finance (CM-706, ADR CM-0017 §8): TDS settings on Contractors — whether
-- 194C applies (default on), a lower-deduction certificate rate (section
-- 197) and a note. Touches construction_masters only (ADR-0030).

-- AlterTable
ALTER TABLE "construction_masters"."contractors" ADD COLUMN     "tds_applicable" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "tds_lower_rate" DECIMAL(5,2),
ADD COLUMN     "tds_note" TEXT;

ALTER TABLE "construction_masters"."contractors" ADD CONSTRAINT "contractors_tds_lower_rate_check" CHECK ("tds_lower_rate" IS NULL OR ("tds_lower_rate" >= 0 AND "tds_lower_rate" <= 100));
