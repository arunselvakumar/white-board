-- Retention release invoices (CM-1108, ADR CM-0023 §8).
-- Touches construction_finance only (ADR-0030).
--
-- Business effect: releasing retention in Contracts creates an invoice of
-- the new origin `retention_release`: payable to the Contractor for what a
-- Work Order releases, or receivable from the Client for what the client
-- contract releases. `source_id` is the release. GST was charged on the
-- bills that held the retention, so these invoices carry no taxable value
-- or GST. They are read-only in finance like `ra_bill` invoices. Existing
-- rows are untouched.
ALTER TYPE "construction_finance"."invoice_origin" ADD VALUE IF NOT EXISTS 'retention_release';

-- The new enum value cannot be used as a literal in the transaction that
-- adds it, so the origin is compared as text.
ALTER TABLE "construction_finance"."invoices" DROP CONSTRAINT "invoices_figures_check";
ALTER TABLE "construction_finance"."invoices" ADD CONSTRAINT "invoices_figures_check" CHECK (
  "amount" > 0
  AND (("project_id" IS NULL) <> ("store_id" IS NULL))
  AND ("store_id" IS NULL OR "party_type" = 'supplier')
  AND ("direction" = 'payable' OR "party_type"::text IN ('other_party', 'client'))
  AND ("party_type"::text <> 'client' OR "direction" = 'receivable')
  AND (
    "origin"::text = 'manual'
    OR ("origin"::text = 'goods_receipt' AND "party_type" = 'supplier')
    OR ("origin"::text IN ('ra_bill', 'retention_release') AND "source_id" IS NOT NULL AND (
      ("party_type" = 'contractor' AND "direction" = 'payable')
      OR ("party_type"::text = 'client' AND "direction" = 'receivable')
    ))
  )
  AND ("origin"::text <> 'retention_release' OR ("taxable_amount" IS NULL AND "gst_amount" IS NULL))
  AND ("department_id" IS NULL OR "party_type" = 'contractor')
  AND ("taxable_amount" IS NULL OR "taxable_amount" >= 0)
  AND ("gst_amount" IS NULL OR "gst_amount" >= 0)
  AND ("due_date" IS NULL OR "due_date" >= "invoice_date")
);
