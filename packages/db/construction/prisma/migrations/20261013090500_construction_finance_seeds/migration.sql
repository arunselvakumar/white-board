-- Finance seeds (CM-701, CM-706, ADR CM-0017 §2, §8). Data only, no schema
-- change, construction_finance only (ADR-0030).
--
-- 1. The TDS rate rows (ADR CM-0008): one line per row of
--    apps/construction-management/src/finance/infrastructure/seeds/statutory/tds-rates.json,
--    printed by `tdsRateSql` (`finance-seeds.test.ts` checks they match).
-- 2. Companies created before M7 get the two company accounts and the
--    Payment Categories new Companies receive from the CompanyCreated
--    listener (keep in step with seeds/finance.json; the same test checks
--    the names). Idempotent: a Company with a live row of the same name (any
--    case) keeps its own. Opening balances are zero, so no ledger entry.

-- TDS rates.
INSERT INTO "construction_finance"."statutory_tds_rates" ("id", "section", "label", "payee_kind", "rate", "single_threshold", "aggregate_threshold", "effective_from", "source") VALUES (gen_random_uuid(), '194C', '194C', 'individual_huf', 1.00, 3000000, 10000000, '2016-06-01', 'Income-tax Act 1961 s.194C(1)(i) 1% for an individual or HUF; s.194C(5) as amended by Finance Act 2016: Rs 30,000 single, Rs 1,00,000 aggregate in a financial year, from 1 Jun 2016') ON CONFLICT DO NOTHING;
INSERT INTO "construction_finance"."statutory_tds_rates" ("id", "section", "label", "payee_kind", "rate", "single_threshold", "aggregate_threshold", "effective_from", "source") VALUES (gen_random_uuid(), '194C', '194C', 'other', 2.00, 3000000, 10000000, '2016-06-01', 'Income-tax Act 1961 s.194C(1)(ii) 2% for any other person; s.194C(5) as amended by Finance Act 2016, from 1 Jun 2016') ON CONFLICT DO NOTHING;
INSERT INTO "construction_finance"."statutory_tds_rates" ("id", "section", "label", "payee_kind", "rate", "single_threshold", "aggregate_threshold", "effective_from", "source") VALUES (gen_random_uuid(), '194C', '194C', 'no_pan', 20.00, 3000000, 10000000, '2016-06-01', 'Income-tax Act 1961 s.206AA: no PAN, the higher of twice the rate or 20%; s.194C(5) thresholds') ON CONFLICT DO NOTHING;
INSERT INTO "construction_finance"."statutory_tds_rates" ("id", "section", "label", "payee_kind", "rate", "single_threshold", "aggregate_threshold", "effective_from", "source") VALUES (gen_random_uuid(), '194C', '393 (194C)', 'individual_huf', 1.00, 3000000, 10000000, '2026-04-01', 'Income-tax Act 2025 s.393 (payments to contractors, formerly 1961 Act s.194C), in force from 1 Apr 2026; figures unchanged') ON CONFLICT DO NOTHING;
INSERT INTO "construction_finance"."statutory_tds_rates" ("id", "section", "label", "payee_kind", "rate", "single_threshold", "aggregate_threshold", "effective_from", "source") VALUES (gen_random_uuid(), '194C', '393 (194C)', 'other', 2.00, 3000000, 10000000, '2026-04-01', 'Income-tax Act 2025 s.393 (formerly 1961 Act s.194C), in force from 1 Apr 2026; figures unchanged') ON CONFLICT DO NOTHING;
INSERT INTO "construction_finance"."statutory_tds_rates" ("id", "section", "label", "payee_kind", "rate", "single_threshold", "aggregate_threshold", "effective_from", "source") VALUES (gen_random_uuid(), '194C', '393 (194C)', 'no_pan', 20.00, 3000000, 10000000, '2026-04-01', 'Income-tax Act 2025 (no PAN: higher rate, formerly 1961 Act s.206AA), in force from 1 Apr 2026; figures unchanged') ON CONFLICT DO NOTHING;

-- Company's Cash Account (primary) and Company's Bank Account.
INSERT INTO "construction_finance"."accounts" ("id", "workspace_id", "kind", "name", "is_primary", "opening_date", "is_seed", "created_by", "updated_by")
SELECT gen_random_uuid(), p."workspace_id", s."kind"::"construction_finance"."account_kind", s."name", s."is_primary", CURRENT_DATE, true, 'system', 'system'
FROM "construction_organization"."company_profiles" p
CROSS JOIN (VALUES
  ('Company''s Cash Account', 'cash', true),
  ('Company''s Bank Account', 'bank', false)
) AS s ("name", "kind", "is_primary")
WHERE p."deleted_at" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "construction_finance"."accounts" t
    WHERE t."workspace_id" = p."workspace_id"
      AND lower(t."name") = lower(s."name")
      AND t."deleted_at" IS NULL
  );

-- Payment Categories.
INSERT INTO "construction_finance"."payment_categories" ("id", "workspace_id", "name", "is_seed", "created_by", "updated_by")
SELECT gen_random_uuid(), p."workspace_id", s."name", true, 'system', 'system'
FROM "construction_organization"."company_profiles" p
CROSS JOIN (VALUES
  ('Bonus'),
  ('Canteen'),
  ('Computer and software'),
  ('Conveyance'),
  ('Entertainment'),
  ('Fuel'),
  ('Hardware'),
  ('Housekeeping'),
  ('Internet'),
  ('Labour'),
  ('Labour Payment'),
  ('Maintenance'),
  ('Marketing and Advertising'),
  ('Medical'),
  ('Miscellaneous'),
  ('Office Supplies'),
  ('Postage and Courier'),
  ('Printing and Stationery'),
  ('Rent'),
  ('Repairs'),
  ('Salary'),
  ('Site Expenses'),
  ('Telephone'),
  ('Travel'),
  ('Utilities')
) AS s ("name")
WHERE p."deleted_at" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "construction_finance"."payment_categories" t
    WHERE t."workspace_id" = p."workspace_id"
      AND lower(t."name") = lower(s."name")
      AND t."deleted_at" IS NULL
  );
