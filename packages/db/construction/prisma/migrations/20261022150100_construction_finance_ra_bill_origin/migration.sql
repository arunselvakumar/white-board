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
