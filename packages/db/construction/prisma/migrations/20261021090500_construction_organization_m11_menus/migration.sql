-- M11 menus on existing Companies' seeded Designations (CM-1101, ADR
-- CM-0023 §22, ADR CM-0003). Data only, construction_organization only
-- (ADR-0030).
--
-- Business effect: a Designation's Permission Template is copied into a
-- Team Member's matrix when the Designation is chosen (CM-0003), and later
-- edits to either do not touch the other. So this migration changes only
-- what Team Members given these Designations from now on start with. It
-- never touches a Team Member's own grants
-- ("construction_organization"."member_menu_permissions"): the Owner gives
-- existing Team Members the new menus in their Permission Matrix.
--
-- New Companies get the same cells from
-- src/organization/infrastructure/seeds/designations.json (version 2); a
-- unit test keeps the two in step. Admin gets every supported cell of each
-- new menu, as a new Company's Admin does.
--
-- Only seeded Designations (is_seed) that still carry their seeded name and
-- have a template are changed. Cells are ORed into the stored bitmask
-- (flag bit positions, src/shared-kernel/access/flags.ts), so nothing is
-- ever removed and running it again changes nothing.

WITH "grants" ("designation", "menu", "flags") AS (VALUES
  ('Admin', 'contracts.boq', 15103),
  ('Admin', 'contracts.work_orders', 2815),
  ('Admin', 'contracts.measurements', 735),
  ('Admin', 'contracts.contractor_bills', 2815),
  ('Admin', 'contracts.client_bills', 2815),
  ('Admin', 'contracts.items', 12303),
  ('Admin', 'masters.clients', 15),
  ('Admin', 'finance.gst', 4226),
  ('Admin', 'finance.tds', 4239),
  ('Admin', 'labour.compliance', 143),
  ('Admin', 'sales.collections', 2815),
  ('Admin', 'sales.rera', 207),
  ('Admin', 'site_work.concrete', 223),
  ('Accountant', 'masters.clients', 15),
  ('Accountant', 'finance.gst', 4226),
  ('Accountant', 'finance.tds', 4239),
  ('Accountant', 'contracts.boq', 2050),
  ('Accountant', 'contracts.work_orders', 2050),
  ('Accountant', 'contracts.contractor_bills', 2242),
  ('Accountant', 'contracts.client_bills', 2242),
  ('Accountant', 'contracts.items', 2),
  ('Accountant', 'labour.compliance', 135),
  ('Accountant', 'sales.collections', 2247),
  ('Accountant', 'sales.rera', 194),
  ('Project Manager', 'masters.clients', 2),
  ('Project Manager', 'contracts.items', 7),
  ('Project Manager', 'contracts.boq', 15095),
  ('Project Manager', 'contracts.work_orders', 2807),
  ('Project Manager', 'contracts.measurements', 727),
  ('Project Manager', 'contracts.contractor_bills', 2807),
  ('Project Manager', 'contracts.client_bills', 2807),
  ('Project Manager', 'labour.compliance', 130),
  ('Project Manager', 'site_work.concrete', 215),
  ('Quality Control', 'site_work.concrete', 215),
  ('Site Engineer', 'contracts.boq', 2),
  ('Site Engineer', 'contracts.work_orders', 2),
  ('Site Engineer', 'contracts.measurements', 199),
  ('Site Engineer', 'contracts.items', 2),
  ('Site Engineer', 'site_work.concrete', 199),
  ('Site Supervisor', 'site_work.concrete', 7),
  ('Structural Engineer', 'site_work.concrete', 210)
),
"merged" AS (
  SELECT d."id",
    d."permission_template" || jsonb_object_agg(
      g."menu",
      COALESCE((d."permission_template" ->> g."menu")::int, 0) | g."flags"
    ) AS "template"
  FROM "construction_organization"."designations" d
  JOIN "grants" g ON g."designation" = d."name"
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
