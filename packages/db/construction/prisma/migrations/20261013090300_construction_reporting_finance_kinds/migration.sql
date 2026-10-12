-- Finance (CM-709, ADR CM-0017 §16): report kinds for the Ledger, Petty
-- Cash, Transactions, Contractor Payments, Supplier Payments, Other
-- Expenses, TDS 194C and Due Payments reports. Touches
-- construction_reporting only (ADR-0030).

-- AlterEnum
ALTER TYPE "construction_reporting"."report_kind" ADD VALUE 'account_ledger';
ALTER TYPE "construction_reporting"."report_kind" ADD VALUE 'petty_cash';
ALTER TYPE "construction_reporting"."report_kind" ADD VALUE 'transactions';
ALTER TYPE "construction_reporting"."report_kind" ADD VALUE 'contractor_payments';
ALTER TYPE "construction_reporting"."report_kind" ADD VALUE 'supplier_payments';
ALTER TYPE "construction_reporting"."report_kind" ADD VALUE 'other_expenses';
ALTER TYPE "construction_reporting"."report_kind" ADD VALUE 'tds_194c';
ALTER TYPE "construction_reporting"."report_kind" ADD VALUE 'due_payments';
