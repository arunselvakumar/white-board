-- Material reconciliation (CM-1110, ADR CM-0023 §10).
-- Touches construction_contracts only (ADR-0030).
--
-- Business effect: a material reconciliation recovery or a material issued
-- at cost on a running bill names the Material it recovers, so what was
-- recovered for each Material on earlier bills is known; and a 10CA
-- (quantity) escalation component can name the Material whose reconciled
-- consumption fills its quantity. Existing rows: both columns null.
ALTER TABLE "construction_contracts"."bill_deductions"
  ADD COLUMN "material_id" UUID;

CREATE INDEX "bill_deductions_workspace_id_material_id_idx" ON "construction_contracts"."bill_deductions"("workspace_id", "material_id");

-- A material reconciliation recovery always names its Material; only the
-- two material kinds may name one.
ALTER TABLE "construction_contracts"."bill_deductions" ADD CONSTRAINT "bill_deductions_material_check" CHECK (
  ("kind" <> 'material_reconciliation' OR "material_id" IS NOT NULL)
  AND ("material_id" IS NULL OR "kind" IN ('material_reconciliation', 'material_at_cost'))
);

ALTER TABLE "construction_contracts"."escalation_clause_components"
  ADD COLUMN "material_id" UUID;

-- Only a quantity (10CA) component names a Material.
ALTER TABLE "construction_contracts"."escalation_clause_components" ADD CONSTRAINT "escalation_clause_components_material_check" CHECK (
  "material_id" IS NULL OR "basis" = 'quantity'
);
