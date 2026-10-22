-- Contractor bills (CM-1106, ADR CM-0023 §7). Touches construction_contracts
-- only (ADR-0030).
--
-- Business effect: a bill is drafted before it is numbered. Like a Work
-- Order (CM-1104), it takes its number from the `contractor_bill` sequence
-- rule, and its running-bill ordinal on the Work Order, when it is first
-- submitted, so a deleted draft never uses up a number. Both columns may be
-- null on a draft. The live-number and ordinal partial unique indexes
-- ignore nulls, so they keep holding for submitted bills. No bill rows
-- exist yet, so nothing is backfilled.
ALTER TABLE "construction_contracts"."bills"
  ALTER COLUMN "number" DROP NOT NULL,
  ALTER COLUMN "ordinal" DROP NOT NULL;
