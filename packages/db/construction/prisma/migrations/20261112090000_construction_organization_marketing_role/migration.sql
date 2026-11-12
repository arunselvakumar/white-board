-- The default Marketing Role in every existing Company, and the Marketing
-- menus for the seeded Admin, which holds every cell (ADR CM-0040 §3,
-- ADR CM-0024). No other Role gets a Marketing cell. A Company that already
-- has a live Role named Marketing keeps it and gets no default one.
-- Touches no other schema (ADR-0030).
--
-- Flag bits (src/shared-kernel/access/flags.ts): create 1, read 2,
-- update 4, delete 8, report 128, view_all 256, notification 512,
-- transfer 1024, export 4096, import 8192.

-- 1. The Marketing Role, in every Company where the name is free. Every
-- Company has a Team Member: its Owner.

CREATE TABLE "migration_marketing_role" (
    "role_id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL
);

INSERT INTO "migration_marketing_role" ("role_id", "workspace_id")
SELECT gen_random_uuid(), c."workspace_id"
  FROM (SELECT DISTINCT "workspace_id" FROM "construction_organization"."team_members") c
 WHERE NOT EXISTS (
       SELECT 1 FROM "construction_organization"."roles" r
        WHERE r."workspace_id" = c."workspace_id"
          AND r."deleted_at" IS NULL
          AND lower(r."name") = 'marketing');

INSERT INTO "construction_organization"."roles"
    ("id", "workspace_id", "name", "description", "is_seed", "created_by", "updated_by")
SELECT m."role_id", m."workspace_id", 'Marketing',
       'Plans and logs Visits to Prospect Companies, keeps their Contacts and Stage, and follows up. Sees only their own Visits, Follow-ups and Companies.',
       true, 'system', 'system'
  FROM "migration_marketing_role" m;

-- Marketing Role cells
INSERT INTO "construction_organization"."role_menu_permissions"
    ("workspace_id", "role_id", "menu", "flags", "updated_by")
SELECT m."workspace_id", m."role_id", cell."menu", cell."flags", 'system'
  FROM "migration_marketing_role" m,
       (VALUES
         ('marketing.dashboard', 2),
         ('marketing.visits', 7),
         ('marketing.follow_ups', 519),
         ('marketing.companies', 7)
       ) AS cell("menu", "flags");

INSERT INTO "construction_organization"."audit_events"
    ("id", "workspace_id", "actor_user_id", "action", "entity_type", "entity_id", "before", "after", "occurred_at")
SELECT gen_random_uuid(), m."workspace_id", 'system', 'role.created', 'role', m."role_id"::text,
       NULL,
       jsonb_build_object(
         'name', 'Marketing',
         'description', r."description",
         'permissions', jsonb_build_object(
           'marketing.dashboard', jsonb_build_array('read'),
           'marketing.visits', jsonb_build_array('create', 'read', 'update'),
           'marketing.follow_ups', jsonb_build_array('create', 'read', 'update', 'notification'),
           'marketing.companies', jsonb_build_array('create', 'read', 'update'))),
       now()
  FROM "migration_marketing_role" m
  JOIN "construction_organization"."roles" r ON r."id" = m."role_id";

DROP TABLE "migration_marketing_role";

-- 2. Every supported Marketing cell for the seeded Admin, as a new
-- Company's Admin gets from "ALL".

-- Admin cells
INSERT INTO "construction_organization"."role_menu_permissions"
    ("workspace_id", "role_id", "menu", "flags", "updated_by")
SELECT r."workspace_id", r."id", cell."menu", cell."flags", 'system'
  FROM "construction_organization"."roles" r,
       (VALUES
         ('marketing.dashboard', 258),
         ('marketing.visits', 4495),
         ('marketing.follow_ups', 783),
         ('marketing.companies', 13583),
         ('marketing.team', 6)
       ) AS cell("menu", "flags")
 WHERE r."is_seed"
   AND r."deleted_at" IS NULL
   AND r."name" = 'Admin'
ON CONFLICT ("role_id", "menu") DO UPDATE
   SET "flags" = "construction_organization"."role_menu_permissions"."flags" | EXCLUDED."flags",
       "updated_at" = now(),
       "updated_by" = 'system';
