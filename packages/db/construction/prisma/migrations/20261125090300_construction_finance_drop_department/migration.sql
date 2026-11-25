-- Departments go (ADR CM-0048). construction_finance only (ADR-0030).
--
-- Business effect: a Contractor invoice has no Department. Amounts, TDS
-- and balances never depended on it. The Department each invoice named is
-- dropped with no audit record (CM-0048 §7).

ALTER TABLE "construction_finance"."invoices" DROP COLUMN "department_id";
