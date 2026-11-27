-- Site Engineers become Employees (ADR CM-0055).
--
-- Business effect: the app is not in production, and the owner said every
-- Site Engineer is test data that may go. The Site Engineer list goes; an
-- Employee on the Site Engineer Role takes its place. A Site Engineer's
-- sign-in is not deleted: the next migration turns it into an ordinary
-- Office Staff member on the same Role.
--
-- Schemas: changes construction_masters only (ADR-0030). One audit event
-- per Company records the count (shared kernel audit log). No other schema
-- has a foreign key, view or index on `supervisors`.

-- 1. Keep a record of what goes.
INSERT INTO "construction_organization"."audit_events"
    ("id", "workspace_id", "actor_user_id", "action", "entity_type", "entity_id", "before", "after", "occurred_at")
SELECT gen_random_uuid(), s."workspace_id", 'system', 'site_engineers.replaced_by_employees', 'workspace', s."workspace_id",
       jsonb_build_object('siteEngineers', count(*), 'names', jsonb_agg(s."name" ORDER BY s."name")),
       '{}'::jsonb,
       now()
  FROM "construction_masters"."supervisors" s
 GROUP BY s."workspace_id";

-- 2. The table and its gender enum go (Employees use construction_labour.gender).
DROP TABLE "construction_masters"."supervisors";
DROP TYPE "construction_masters"."gender";
