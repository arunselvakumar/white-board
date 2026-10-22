-- Contractor bills reach finance (CM-1106, ADR CM-0023 §7). Touches
-- construction_finance only (ADR-0030).
--
-- Business effect: an approved Contractor Bill creates a payable invoice
-- whose origin is `ra_bill`. Finance shows it read-only and links back to
-- the bill, so the invoice remembers which bill it came from in
-- `source_id` (the bill's id in construction_contracts; no foreign key
-- across schemas). Existing invoices keep a null source.
ALTER TYPE "construction_finance"."invoice_origin" ADD VALUE IF NOT EXISTS 'ra_bill';

ALTER TABLE "construction_finance"."invoices"
  ADD COLUMN "source_id" UUID NULL;

CREATE INDEX "invoices_source_id_idx" ON "construction_finance"."invoices"("source_id");

-- A Contractor Bill's invoice is a Contractor's, as a Goods Receipt's is a
-- Supplier's. The origin is compared as text: the enum value added above
-- cannot be used as a literal in the transaction that adds it.
ALTER TABLE "construction_finance"."invoices" DROP CONSTRAINT "invoices_figures_check";
ALTER TABLE "construction_finance"."invoices" ADD CONSTRAINT "invoices_figures_check" CHECK (
  "amount" > 0
  AND (("project_id" IS NULL) <> ("store_id" IS NULL))
  AND ("store_id" IS NULL OR "party_type" = 'supplier')
  AND ("direction" = 'payable' OR "party_type" = 'other_party')
  AND (
    "origin"::text = 'manual'
    OR ("origin"::text = 'goods_receipt' AND "party_type" = 'supplier')
    OR ("origin"::text = 'ra_bill' AND "party_type" = 'contractor'
      AND "direction" = 'payable' AND "source_id" IS NOT NULL)
  )
  AND ("department_id" IS NULL OR "party_type" = 'contractor')
  AND ("taxable_amount" IS NULL OR "taxable_amount" >= 0)
  AND ("gst_amount" IS NULL OR "gst_amount" >= 0)
  AND ("due_date" IS NULL OR "due_date" >= "invoice_date")
);
