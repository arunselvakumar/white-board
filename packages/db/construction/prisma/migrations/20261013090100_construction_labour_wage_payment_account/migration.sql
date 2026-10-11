-- Finance (CM-707, ADR CM-0017 §12): a wage payment names the finance
-- account it was paid from (`construction_finance.accounts`, kept without a
-- foreign key across schemas). Required by the application from M7; rows
-- recorded before M7 stay null and are not backfilled. Touches
-- construction_labour only (ADR-0030).

-- AlterTable
ALTER TABLE "construction_labour"."wage_payments" ADD COLUMN     "account_id" UUID;
