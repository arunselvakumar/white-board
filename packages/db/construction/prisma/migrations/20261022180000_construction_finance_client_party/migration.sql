-- Clients become a finance party (CM-1107, ADR CM-0023 §2, §7, §14).
-- Touches construction_finance only (ADR-0030).
--
-- Business effect: an approved Client Bill creates a receivable invoice to
-- the Project's Client (origin `ra_bill`), and money received from a Client
-- is a Payment In. The Client may hold back income-tax TDS (194C, or 393
-- under the Income-tax Act 2025) and, for a government client, GST-TDS
-- (s.51, 2 %): both are kept on the receipt and posted as their own party
-- entries (`client_tds`, `gst_tds`), so the invoice is settled by cash +
-- TDS + GST-TDS while the account moves only by the cash. Other parties'
-- rows and balances are untouched: the new values and columns are 0 or
-- absent for them.
ALTER TYPE "construction_finance"."party_type" ADD VALUE IF NOT EXISTS 'client';
ALTER TYPE "construction_finance"."counterparty_kind" ADD VALUE IF NOT EXISTS 'client';
ALTER TYPE "construction_finance"."party_entry_kind" ADD VALUE IF NOT EXISTS 'client_tds';
ALTER TYPE "construction_finance"."party_entry_kind" ADD VALUE IF NOT EXISTS 'gst_tds';

ALTER TABLE "construction_finance"."party_payments"
  ADD COLUMN "client_tds_amount" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN "gst_tds_amount" BIGINT NOT NULL DEFAULT 0;

-- The new enum values cannot be used as literals in the transaction that
-- adds them, so party types are compared as text below.

-- A Client's invoices are receivable: they come from Client Bills.
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
    OR ("origin"::text = 'ra_bill' AND "source_id" IS NOT NULL AND (
      ("party_type" = 'contractor' AND "direction" = 'payable')
      OR ("party_type"::text = 'client' AND "direction" = 'receivable')
    ))
  )
  AND ("department_id" IS NULL OR "party_type" = 'contractor')
  AND ("taxable_amount" IS NULL OR "taxable_amount" >= 0)
  AND ("gst_amount" IS NULL OR "gst_amount" >= 0)
  AND ("due_date" IS NULL OR "due_date" >= "invoice_date")
);

-- Payment In is from an Other Party or a Client; a Client is never paid.
ALTER TABLE "construction_finance"."party_payments" DROP CONSTRAINT "party_payments_figures_check";
ALTER TABLE "construction_finance"."party_payments" ADD CONSTRAINT "party_payments_figures_check" CHECK (
  "amount" > 0
  AND (("project_id" IS NULL) <> ("store_id" IS NULL))
  AND ("store_id" IS NULL OR "party_type" = 'supplier')
  AND ("direction" = 'out' OR "party_type"::text IN ('other_party', 'client'))
  AND ("party_type"::text <> 'client' OR "direction" = 'in')
  AND ("mode" <> 'cheque' OR "cheque_number" IS NOT NULL)
  AND ("mode" NOT IN ('online', 'upi') OR "reference" IS NOT NULL)
);

-- TDS and GST-TDS deducted by the Client: receipts from a Client only.
ALTER TABLE "construction_finance"."party_payments" ADD CONSTRAINT "party_payments_client_tds_check" CHECK (
  "client_tds_amount" >= 0
  AND "gst_tds_amount" >= 0
  AND (("client_tds_amount" = 0 AND "gst_tds_amount" = 0)
    OR ("party_type"::text = 'client' AND "direction" = 'in'))
);

-- A Client's TDS and GST-TDS entries settle like a receipt: positive.
ALTER TABLE "construction_finance"."party_entries" DROP CONSTRAINT "party_entries_amount_check";
ALTER TABLE "construction_finance"."party_entries" ADD CONSTRAINT "party_entries_amount_check" CHECK (
  "amount" <> 0
  AND (
    "reverses_entry_id" IS NOT NULL
    OR "kind" IN ('opening', 'write_off')
    OR ("kind"::text IN ('invoice', 'receipt', 'client_tds', 'gst_tds') AND "amount" > 0)
    OR ("kind" IN ('sales_invoice', 'payment', 'tds') AND "amount" < 0)
  )
);
