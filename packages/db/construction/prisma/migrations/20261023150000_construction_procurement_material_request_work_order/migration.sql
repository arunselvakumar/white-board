-- Material reconciliation (CM-1110, ADR CM-0023 §10).
-- Touches construction_procurement only (ADR-0030).
--
-- Business effect: a Material Request raised for a Contractor can name the
-- Work Order the material is issued under, and so can its Delivery Notes
-- through it. Contracts counts the delivered quantities towards that Work
-- Order's reconciliation. The id points into construction_contracts, so
-- like `contractor_id` it is not a foreign key across schemas. Existing
-- rows: all null (no Work Order named; contracts attributes them by rule
-- or shows them as unattributed).
ALTER TABLE "construction_procurement"."material_requests"
  ADD COLUMN "work_order_id" UUID;

CREATE INDEX "material_requests_workspace_id_work_order_id_idx" ON "construction_procurement"."material_requests"("workspace_id", "work_order_id");

CREATE INDEX "material_requests_workspace_id_project_id_contractor_id_idx" ON "construction_procurement"."material_requests"("workspace_id", "project_id", "contractor_id");
