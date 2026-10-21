-- Menus added in M5–M8 on the seeded Designations of Companies created
-- before them (ADR CM-0003, ADR CM-0024). Data only,
-- construction_organization only (ADR-0030).
--
-- Business effect: a Company copies the seed Designations when it is created
-- (src/organization/infrastructure/seeds/designations.json), and no migration
-- before this one granted later menus to those copies. So an Admin or Project
-- Manager chosen in a Company created before, say, M7 starts with no Other
-- Expenses, while the same Designation in a new Company has it. This
-- migration gives those Designations the cells a new Company's copy gets
-- today, for matrix cells that did not exist yet when the Company was
-- created:
--
--   M5 (10 Oct): Terms & Conditions
--   M6 (11 Oct): Site Diary, Hindrance Register, and Reject on Daily
--                Worksheet and Equipment Usage
--   M7 (12 Oct): Other Expenses
--   M8 (15 Oct): Tags
--
-- A Designation's Permission Template is copied into a Team Member's matrix
-- when the Designation is chosen (CM-0003), and later edits to either do not
-- touch the other. So this changes only what Team Members given these
-- Designations from now on start with. It never touches a Team Member's own
-- grants ("construction_organization"."member_menu_permissions"): the Owner
-- gives existing Team Members these menus in their Permission Matrix.
--
-- A cell is added only when the Designation was created before the cell's
-- milestone was merged to main, so it could not have been in the template
-- and the Owner cannot have removed it. Cells that already existed but that a
-- later seed granted to more Designations (for example Petty Cash for Site
-- Engineer in M7) are left alone: the Owner could have granted those. Quality
-- Control and Structural Engineer had no template before M8 and are skipped.
--
-- Only seeded Designations (is_seed) that still carry their seeded name and
-- have a template are changed. Cells are ORed into the stored bitmask (flag
-- bit positions, src/shared-kernel/access/flags.ts), so nothing is ever
-- removed and running it again changes nothing. A unit test keeps the cells
-- equal to designations.json.

WITH "grants" ("designation", "menu", "flags", "since") AS (VALUES
  -- M5 (#48)
  ('Admin', 'masters.terms_conditions', 15, '2026-10-10 20:55:04+05:30'::timestamptz),
  -- M6 (#53)
  ('Admin', 'site_work.daily_worksheet', 32, '2026-10-11 13:50:25+05:30'),
  ('Admin', 'site_work.equipment_usage', 32, '2026-10-11 13:50:25+05:30'),
  ('Admin', 'site_work.site_diary', 79, '2026-10-11 13:50:25+05:30'),
  ('Admin', 'site_work.hindrances', 207, '2026-10-11 13:50:25+05:30'),
  ('Project Manager', 'site_work.daily_worksheet', 32, '2026-10-11 13:50:25+05:30'),
  ('Project Manager', 'site_work.equipment_usage', 32, '2026-10-11 13:50:25+05:30'),
  ('Project Manager', 'site_work.site_diary', 79, '2026-10-11 13:50:25+05:30'),
  ('Project Manager', 'site_work.hindrances', 207, '2026-10-11 13:50:25+05:30'),
  ('Site Engineer', 'site_work.site_diary', 71, '2026-10-11 13:50:25+05:30'),
  ('Site Engineer', 'site_work.hindrances', 71, '2026-10-11 13:50:25+05:30'),
  ('Site Supervisor', 'site_work.site_diary', 7, '2026-10-11 13:50:25+05:30'),
  ('Site Supervisor', 'site_work.hindrances', 3, '2026-10-11 13:50:25+05:30'),
  -- M7 (#57)
  ('Admin', 'finance.other_expenses', 255, '2026-10-12 10:46:29+05:30'),
  ('Accountant', 'finance.other_expenses', 255, '2026-10-12 10:46:29+05:30'),
  ('Project Manager', 'finance.other_expenses', 2, '2026-10-12 10:46:29+05:30'),
  ('Site Engineer', 'finance.other_expenses', 7, '2026-10-12 10:46:29+05:30'),
  ('Site Supervisor', 'finance.other_expenses', 3, '2026-10-12 10:46:29+05:30'),
  -- M8 (#80)
  ('Admin', 'masters.tags', 15, '2026-10-15 09:12:07+05:30'),
  ('Project Manager', 'masters.tags', 15, '2026-10-15 09:12:07+05:30'),
  ('Site Engineer', 'masters.tags', 3, '2026-10-15 09:12:07+05:30'),
  ('Site Supervisor', 'masters.tags', 2, '2026-10-15 09:12:07+05:30')
),
"merged" AS (
  SELECT d."id",
    d."permission_template" || jsonb_object_agg(
      g."menu",
      COALESCE((d."permission_template" ->> g."menu")::int, 0) | g."flags"
    ) AS "template"
  FROM "construction_organization"."designations" d
  JOIN "grants" g ON g."designation" = d."name"
    AND d."created_at" < g."since"
  WHERE d."is_seed"
    AND d."deleted_at" IS NULL
    AND jsonb_typeof(d."permission_template") = 'object'
  GROUP BY d."id"
)
UPDATE "construction_organization"."designations" d
SET "permission_template" = m."template",
    "updated_at" = now()
FROM "merged" m
WHERE d."id" = m."id"
  AND d."permission_template" <> m."template";
