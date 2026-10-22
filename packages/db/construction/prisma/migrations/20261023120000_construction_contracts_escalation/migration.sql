-- Price indices and escalation bills (CM-1109, ADR CM-0023 §9).
-- Touches construction_contracts only (ADR-0030).
--
-- Business effect: an escalation clause component can be worked out the
-- 10CA way (quantity × base price × the index change, for cement and
-- steel) instead of as a 10CC weight; an "other" deduction on a running
-- bill can name the negative escalation bill it recovers; and the price
-- index, clause and escalation bill figures get the checks the
-- application already keeps. Existing rows: none (CM-1109 is the first
-- writer of these tables), so the checks hold.
CREATE TYPE "construction_contracts"."escalation_basis" AS ENUM ('weighted', 'quantity');

ALTER TABLE "construction_contracts"."escalation_clause_components"
  ADD COLUMN "basis" "construction_contracts"."escalation_basis" NOT NULL DEFAULT 'weighted',
  ADD COLUMN "base_price" BIGINT;

-- A weighted component has a weight and no base price; a quantity one a
-- base price and no weight.
ALTER TABLE "construction_contracts"."escalation_clause_components" ADD CONSTRAINT "escalation_clause_components_basis_check" CHECK (
  ("basis" = 'weighted' AND "weight_percent" > 0 AND "weight_percent" <= 100 AND "base_price" IS NULL)
  OR ("basis" = 'quantity' AND "weight_percent" = 0 AND "base_price" > 0)
);

-- The non-escalable share is a percentage; a contractor-side clause names
-- its Work Order, the client contract's names none.
ALTER TABLE "construction_contracts"."escalation_clauses" ADD CONSTRAINT "escalation_clauses_figures_check" CHECK (
  "non_escalable_percent" >= 0 AND "non_escalable_percent" < 100
  AND ("side" <> 'contractor' OR "work_order_id" IS NOT NULL)
  AND ("side" <> 'client' OR "work_order_id" IS NULL)
);

-- An index value is positive, on the first day of its month.
ALTER TABLE "construction_contracts"."price_indices" ADD CONSTRAINT "price_indices_figures_check" CHECK (
  "value" > 0 AND EXTRACT(DAY FROM "month") = 1
);

-- An escalation bill is for whole months and carries its working.
ALTER TABLE "construction_contracts"."bills" ADD CONSTRAINT "bills_escalation_period_check" CHECK (
  "type" <> 'escalation'
  OR ("period_from" IS NOT NULL AND "period_to" IS NOT NULL AND "period_to" >= "period_from" AND "working" IS NOT NULL)
);

ALTER TABLE "construction_contracts"."bill_deductions"
  ADD COLUMN "escalation_bill_id" UUID;

CREATE INDEX "bill_deductions_workspace_id_escalation_bill_id_idx" ON "construction_contracts"."bill_deductions"("workspace_id", "escalation_bill_id");
