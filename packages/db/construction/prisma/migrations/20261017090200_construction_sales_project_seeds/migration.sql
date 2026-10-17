-- Sales seeds for existing Projects (CM-1001, ADR CM-0022 §2). Data only,
-- construction_sales only (ADR-0030).
--
-- Projects created before M10 get the Funnel Stages, Lead Sources and Lost
-- Reasons that new Projects receive from the ProjectCreated listener (keep in
-- step with src/sales/infrastructure/seeds/project-sales.json; a test checks
-- the names). Idempotent: a Project with a live row of the same name (any
-- case) keeps its own.

INSERT INTO "construction_sales"."funnel_stages" ("id", "workspace_id", "project_id", "name", "sort_order", "is_seed", "created_by", "updated_by")
SELECT gen_random_uuid(), p."workspace_id", p."id", s."name", s."sort_order", true, 'system', 'system'
FROM "construction_projects"."projects" p
CROSS JOIN (VALUES
  ('New', 1),
  ('Contacted', 2),
  ('Site Visit', 3),
  ('Negotiation', 4)
) AS s ("name", "sort_order")
WHERE p."deleted_at" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "construction_sales"."funnel_stages" t
    WHERE t."project_id" = p."id"
      AND lower(t."name") = lower(s."name")
      AND t."deleted_at" IS NULL
  );

INSERT INTO "construction_sales"."lead_sources" ("id", "workspace_id", "project_id", "name", "is_seed", "created_by", "updated_by")
SELECT gen_random_uuid(), p."workspace_id", p."id", s."name", true, 'system', 'system'
FROM "construction_projects"."projects" p
CROSS JOIN (VALUES
  ('Walk-in'),
  ('Referral'),
  ('Website'),
  ('Property portal'),
  ('Hoarding'),
  ('Social media')
) AS s ("name")
WHERE p."deleted_at" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "construction_sales"."lead_sources" t
    WHERE t."project_id" = p."id"
      AND lower(t."name") = lower(s."name")
      AND t."deleted_at" IS NULL
  );

INSERT INTO "construction_sales"."lost_reasons" ("id", "workspace_id", "project_id", "name", "is_seed", "created_by", "updated_by")
SELECT gen_random_uuid(), p."workspace_id", p."id", s."name", true, 'system', 'system'
FROM "construction_projects"."projects" p
CROSS JOIN (VALUES
  ('Budget'),
  ('Location'),
  ('Bought elsewhere'),
  ('Not reachable'),
  ('Not interested')
) AS s ("name")
WHERE p."deleted_at" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "construction_sales"."lost_reasons" t
    WHERE t."project_id" = p."id"
      AND lower(t."name") = lower(s."name")
      AND t."deleted_at" IS NULL
  );
