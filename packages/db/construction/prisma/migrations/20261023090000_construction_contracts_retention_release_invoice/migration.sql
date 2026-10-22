-- Advances, retention release and DLP (CM-1108, ADR CM-0023 §8).
-- Touches construction_contracts only (ADR-0030).
--
-- Business effect: a retention release now creates a finance invoice for
-- what it releases (payable to the Contractor, or receivable from the
-- Client), and the release keeps that invoice's id so deleting the release
-- can remove it while it is unsettled. A client-side release also names
-- the Client it is due from, so the Client's retention receivable can
-- subtract it. Existing rows: none (CM-1108 is the first writer).
ALTER TABLE "construction_contracts"."retention_releases"
  ADD COLUMN "invoice_id" UUID,
  ADD COLUMN "client_id" UUID;

-- A release moves money: never zero or negative. A contractor-side
-- release names its Work Order; a client-side one its Client.
ALTER TABLE "construction_contracts"."retention_releases" ADD CONSTRAINT "retention_releases_figures_check" CHECK (
  "amount" > 0
  AND ("side" <> 'contractor' OR "work_order_id" IS NOT NULL)
  AND ("side" <> 'client' OR ("work_order_id" IS NULL AND "client_id" IS NOT NULL))
);

-- An advance moves money; a given one names its Work Order, a received
-- one its Client.
ALTER TABLE "construction_contracts"."advances" ADD CONSTRAINT "advances_figures_check" CHECK (
  "amount" > 0
  AND "recovery_value" > 0
  AND ("direction" <> 'given' OR "work_order_id" IS NOT NULL)
  AND ("direction" <> 'received' OR ("work_order_id" IS NULL AND "client_id" IS NOT NULL))
);

ALTER TABLE "construction_contracts"."bank_guarantees" ADD CONSTRAINT "bank_guarantees_figures_check" CHECK (
  "amount" > 0
  AND ("issued_on" IS NULL OR "expires_on" >= "issued_on")
  AND ("side" <> 'contractor' OR "work_order_id" IS NOT NULL)
);

CREATE INDEX "advances_workspace_id_payment_id_idx" ON "construction_contracts"."advances"("workspace_id", "payment_id");
CREATE INDEX "retention_releases_workspace_id_invoice_id_idx" ON "construction_contracts"."retention_releases"("workspace_id", "invoice_id");
