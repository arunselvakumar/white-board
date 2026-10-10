-- Follow-up to 20261011090000_construction_masters_materials (#48 review).
-- Touches only construction_masters (ADR-0030); separate because the first
-- one already ran on preview databases.

-- A Material's discount type needs its value: CHECK passes on NULL, so
-- "percent" with no percent (or "amount" with no amount) slipped through.
ALTER TABLE "construction_masters"."materials" DROP CONSTRAINT "materials_discount_check";
ALTER TABLE "construction_masters"."materials" ADD CONSTRAINT "materials_discount_check" CHECK (
  ("discount_type" IS NULL AND "discount_percent" IS NULL AND "discount_amount" IS NULL)
  OR ("discount_type" = 'percent' AND "discount_percent" IS NOT NULL AND "discount_percent" BETWEEN 0 AND 100 AND "discount_amount" IS NULL)
  OR ("discount_type" = 'amount' AND "discount_amount" IS NOT NULL AND "discount_amount" >= 0 AND "discount_percent" IS NULL)
);
