-- Labours and Site Engineers become Employees (ADR CM-0055).
--
-- Business effect: the app is not in production; the owner said every
-- Labour and Site Engineer, and what hangs off them, is test data that may
-- go. The Labours' wage payments are deleted in `construction_labour` by
-- the next migration, so their postings to the Company's bank and cash
-- accounts go first, here, and those accounts' balances drop by them.
-- Paid To / Received From labels that named a Labour now say Employee;
-- they keep the name they were saved with (`counterparty_name`), and the
-- id names no Employee.
--
-- Schemas: changes construction_finance only (ADR-0030). It reads
-- `construction_labour.wage_payments` to find the postings; nothing here
-- has a foreign key into that schema. One audit event per Company records
-- the count (shared kernel audit log, `construction_organization.audit_events`).

-- 1. Keep a record of what goes.
INSERT INTO "construction_organization"."audit_events"
    ("id", "workspace_id", "actor_user_id", "action", "entity_type", "entity_id", "before", "after", "occurred_at")
SELECT gen_random_uuid(), e."workspace_id", 'system', 'account_entries.labour_wage_payments_removed', 'workspace', e."workspace_id",
       jsonb_build_object('entries', count(*), 'amount', sum(e."amount")),
       '{}'::jsonb,
       now()
  FROM "construction_finance"."account_entries" e
  JOIN "construction_labour"."wage_payments" p ON p."id" = e."source_id"
 WHERE e."source_type" = 'wage_payment' AND p."party_type" = 'labour'
 GROUP BY e."workspace_id";

-- 2. The postings of Labours' wage payments go.
DELETE FROM "construction_finance"."account_entries" e
 USING "construction_labour"."wage_payments" p
 WHERE e."source_type" = 'wage_payment'
   AND p."id" = e."source_id"
   AND p."party_type" = 'labour';

-- 3. `labour` becomes `employee` on Paid To / Received From labels.
BEGIN;
CREATE TYPE "construction_finance"."counterparty_kind_new" AS ENUM ('contractor', 'supplier', 'other_party', 'employee', 'vendor', 'team_member');
ALTER TABLE "construction_finance"."account_entries" ALTER COLUMN "counterparty_kind" TYPE "construction_finance"."counterparty_kind_new"
  USING (CASE WHEN "counterparty_kind"::text = 'labour' THEN 'employee' ELSE "counterparty_kind"::text END::"construction_finance"."counterparty_kind_new");
ALTER TABLE "construction_finance"."transactions" ALTER COLUMN "counterparty_kind" TYPE "construction_finance"."counterparty_kind_new"
  USING (CASE WHEN "counterparty_kind"::text = 'labour' THEN 'employee' ELSE "counterparty_kind"::text END::"construction_finance"."counterparty_kind_new");
ALTER TABLE "construction_finance"."petty_cash_vouchers" ALTER COLUMN "counterparty_kind" TYPE "construction_finance"."counterparty_kind_new"
  USING (CASE WHEN "counterparty_kind"::text = 'labour' THEN 'employee' ELSE "counterparty_kind"::text END::"construction_finance"."counterparty_kind_new");
ALTER TYPE "construction_finance"."counterparty_kind" RENAME TO "counterparty_kind_old";
ALTER TYPE "construction_finance"."counterparty_kind_new" RENAME TO "counterparty_kind";
DROP TYPE "construction_finance"."counterparty_kind_old";
COMMIT;
