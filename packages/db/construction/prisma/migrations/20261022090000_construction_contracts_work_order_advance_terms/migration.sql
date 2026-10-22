-- Work Order terms (CM-1104, ADR CM-0023 §5). Touches construction_contracts
-- only (ADR-0030).
--
-- Business effect: a Work Order records its mobilisation advance and the %
-- of each bill that recovers it (the advance itself is paid in CM-1108),
-- and why it was closed. A draft has no number yet: it takes one from the
-- `work_order` sequence rule when it is first submitted, so `number` may be
-- null (the live-number unique index ignores nulls). No rows exist yet, so
-- nothing is backfilled.
ALTER TABLE "construction_contracts"."work_orders"
  ADD COLUMN "mobilisation_advance" BIGINT NULL,
  ADD COLUMN "mobilisation_recovery_percent" DECIMAL(5,2) NULL,
  ADD COLUMN "close_reason" TEXT NULL,
  ALTER COLUMN "number" DROP NOT NULL;
