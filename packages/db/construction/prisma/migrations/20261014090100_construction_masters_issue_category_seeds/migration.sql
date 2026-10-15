-- Issue Category seeds (CM-801, ADR CM-0019 §1). Data only, no schema
-- change, construction_masters only (ADR-0030).
--
-- Companies created before M8 get the 14 Issue Categories of `modules/05`
-- that new Companies receive from the CompanyCreated listener (keep in step
-- with src/masters/infrastructure/seeds/issue-categories.json; a test checks
-- the names). Idempotent: a Company with a live row of the same name (any
-- case) keeps its own.

INSERT INTO "construction_masters"."issue_categories" ("id", "workspace_id", "name", "is_seed", "created_by", "updated_by")
SELECT gen_random_uuid(), p."workspace_id", s."name", true, 'system', 'system'
FROM "construction_organization"."company_profiles" p
CROSS JOIN (VALUES
  ('Client'),
  ('Communication'),
  ('Compliance'),
  ('Design'),
  ('Environmental'),
  ('Financial'),
  ('Management'),
  ('Operational'),
  ('Other'),
  ('Quality'),
  ('RFI'),
  ('Safety'),
  ('Supply'),
  ('Technical')
) AS s ("name")
WHERE p."deleted_at" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "construction_masters"."issue_categories" t
    WHERE t."workspace_id" = p."workspace_id"
      AND lower(t."name") = lower(s."name")
      AND t."deleted_at" IS NULL
  );
