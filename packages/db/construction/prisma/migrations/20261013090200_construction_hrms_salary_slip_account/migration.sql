-- Finance (CM-707, ADR CM-0017 §12): a Paid salary slip names the finance
-- account its money left (`construction_finance.accounts`, no foreign key
-- across schemas). Slips paid before M7 stay null. Touches construction_hrms
-- only (ADR-0030).

-- AlterTable
ALTER TABLE "construction_hrms"."salary_slips" ADD COLUMN     "paid_from_account_id" UUID;
