-- Integrity follow-ups to 20261011090300_construction_procurement (#48
-- review). Touches only construction_procurement (ADR-0030). A separate
-- migration because the first one already ran on preview databases.

-- A reversal must point at a real entry of the ledger (ADR CM-0015 §5).
-- The ledger is append-only, so RESTRICT never blocks a legitimate write.
-- AddForeignKey
ALTER TABLE "construction_procurement"."stock_entries" ADD CONSTRAINT "stock_entries_reverses_entry_id_fkey" FOREIGN KEY ("reverses_entry_id") REFERENCES "construction_procurement"."stock_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A discount type needs its value: CHECK passes on NULL, so a percent with
-- no percent, or a negative amount on a percent line, slipped through.
ALTER TABLE "construction_procurement"."purchase_order_items" DROP CONSTRAINT "purchase_order_items_discount_check";
ALTER TABLE "construction_procurement"."purchase_order_items" ADD CONSTRAINT "purchase_order_items_discount_check" CHECK (
  ("discount_type" IS NULL AND "discount_percent" IS NULL AND "discount_amount" = 0)
  OR ("discount_type" = 'percent' AND "discount_percent" IS NOT NULL AND "discount_percent" BETWEEN 0 AND 100 AND "discount_amount" >= 0)
  OR ("discount_type" = 'amount' AND "discount_percent" IS NULL AND "discount_amount" >= 0)
);
