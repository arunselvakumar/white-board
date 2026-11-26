-- Default Roles under Human Resources (ADR CM-0054), in every existing
-- Company. Touches construction_organization only (ADR-0030).
--
-- 1. New default Roles Labour and Vendor, under Human Resources, with no
--    Permission Matrix cells: Labours and Vendors do not sign in. A Company
--    that already has a live Role of that name keeps it and gets no default
--    one (as the Marketing Role, ADR CM-0040 §3).
-- 2. The default Site Engineer Role goes under Human Resources, unless the
--    Company already put it under a Department (ADR CM-0050).
-- 3. The default Site Supervisor Role is removed. Its live Team Members move
--    to the Company's Site Engineer Role first, then the Role is soft-deleted
--    (row and matrix kept). A Company with no live Site Engineer Role keeps
--    Site Supervisor as it is.
--
-- Every change writes an audit event as the screens do (`role.created`,
-- `role.updated`, `team_member.role_changed`, `role.deleted`).

-- 1. Labour and Vendor. Every Company has a Team Member: its Owner.

CREATE TABLE "migration_hr_roles" (
    "role_id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "department_id" UUID
);

INSERT INTO "migration_hr_roles" ("role_id", "workspace_id", "name", "description", "department_id")
SELECT gen_random_uuid(), c."workspace_id", seed."name", seed."description", d."id"
  FROM (SELECT DISTINCT "workspace_id" FROM "construction_organization"."team_members") c
 CROSS JOIN (VALUES
         ('Labour', 'Labours on site. They do not sign in, so the Role gives no access.'),
         ('Vendor', 'Vendors who supply labour gangs. They do not sign in, so the Role gives no access.')
       ) AS seed("name", "description")
  LEFT JOIN "construction_organization"."departments" d
    ON d."workspace_id" = c."workspace_id"
   AND d."is_system"
   AND d."deleted_at" IS NULL
   AND d."name" = 'Human Resources'
 WHERE NOT EXISTS (
       SELECT 1 FROM "construction_organization"."roles" r
        WHERE r."workspace_id" = c."workspace_id"
          AND r."deleted_at" IS NULL
          AND lower(r."name") = lower(seed."name"));

INSERT INTO "construction_organization"."roles"
    ("id", "workspace_id", "name", "description", "is_seed", "department_id", "created_by", "updated_by")
SELECT m."role_id", m."workspace_id", m."name", m."description", true, m."department_id", 'system', 'system'
  FROM "migration_hr_roles" m;

INSERT INTO "construction_organization"."audit_events"
    ("id", "workspace_id", "actor_user_id", "action", "entity_type", "entity_id", "before", "after", "occurred_at")
SELECT gen_random_uuid(), m."workspace_id", 'system', 'role.created', 'role', m."role_id"::text,
       NULL,
       jsonb_build_object(
         'name', m."name",
         'description', m."description",
         'departmentId', m."department_id",
         'permissions', '{}'::jsonb),
       now()
  FROM "migration_hr_roles" m;

DROP TABLE "migration_hr_roles";

-- 2. Site Engineer under Human Resources.

CREATE TABLE "migration_site_engineer_department" (
    "role_id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "department_id" UUID NOT NULL
);

INSERT INTO "migration_site_engineer_department" ("role_id", "workspace_id", "department_id")
SELECT r."id", r."workspace_id", d."id"
  FROM "construction_organization"."roles" r
  JOIN "construction_organization"."departments" d
    ON d."workspace_id" = r."workspace_id"
   AND d."is_system"
   AND d."deleted_at" IS NULL
   AND d."name" = 'Human Resources'
 WHERE r."is_seed"
   AND r."deleted_at" IS NULL
   AND r."name" = 'Site Engineer'
   AND r."department_id" IS NULL;

UPDATE "construction_organization"."roles" r
   SET "department_id" = m."department_id",
       "updated_at" = now(),
       "updated_by" = 'system'
  FROM "migration_site_engineer_department" m
 WHERE r."id" = m."role_id";

INSERT INTO "construction_organization"."audit_events"
    ("id", "workspace_id", "actor_user_id", "action", "entity_type", "entity_id", "before", "after", "occurred_at")
SELECT gen_random_uuid(), m."workspace_id", 'system', 'role.updated', 'role', m."role_id"::text,
       jsonb_build_object('departmentId', NULL),
       jsonb_build_object('departmentId', m."department_id"),
       now()
  FROM "migration_site_engineer_department" m;

DROP TABLE "migration_site_engineer_department";

-- 3. Site Supervisor removed; its Team Members move to Site Engineer.

CREATE TABLE "migration_site_supervisor" (
    "workspace_id" TEXT NOT NULL,
    "supervisor_role_id" UUID NOT NULL,
    "engineer_role_id" UUID NOT NULL
);

INSERT INTO "migration_site_supervisor" ("workspace_id", "supervisor_role_id", "engineer_role_id")
SELECT s."workspace_id", s."id", e."id"
  FROM "construction_organization"."roles" s
  JOIN LATERAL (
       SELECT r."id" FROM "construction_organization"."roles" r
        WHERE r."workspace_id" = s."workspace_id"
          AND r."deleted_at" IS NULL
          AND r."name" = 'Site Engineer'
        ORDER BY r."is_seed" DESC, r."created_at"
        LIMIT 1) e ON true
 WHERE s."is_seed"
   AND s."deleted_at" IS NULL
   AND s."name" = 'Site Supervisor';

INSERT INTO "construction_organization"."audit_events"
    ("id", "workspace_id", "actor_user_id", "action", "entity_type", "entity_id", "before", "after", "occurred_at")
SELECT gen_random_uuid(), t."workspace_id", 'system', 'team_member.role_changed', 'team_member', t."id"::text,
       jsonb_build_object('roleId', m."supervisor_role_id"),
       jsonb_build_object('name', t."name", 'roleId', m."engineer_role_id"),
       now()
  FROM "construction_organization"."team_members" t
  JOIN "migration_site_supervisor" m ON m."supervisor_role_id" = t."role_id"
 WHERE t."deleted_at" IS NULL;

UPDATE "construction_organization"."team_members" t
   SET "role_id" = m."engineer_role_id",
       "updated_at" = now(),
       "updated_by" = 'system'
  FROM "migration_site_supervisor" m
 WHERE t."role_id" = m."supervisor_role_id"
   AND t."deleted_at" IS NULL;

INSERT INTO "construction_organization"."audit_events"
    ("id", "workspace_id", "actor_user_id", "action", "entity_type", "entity_id", "before", "after", "occurred_at")
SELECT gen_random_uuid(), m."workspace_id", 'system', 'role.deleted', 'role', m."supervisor_role_id"::text,
       jsonb_build_object(
         'name', r."name",
         'description', r."description",
         'departmentId', r."department_id",
         'movedTo', m."engineer_role_id"),
       NULL,
       now()
  FROM "migration_site_supervisor" m
  JOIN "construction_organization"."roles" r ON r."id" = m."supervisor_role_id";

UPDATE "construction_organization"."roles" r
   SET "deleted_at" = now(),
       "updated_at" = now(),
       "updated_by" = 'system'
  FROM "migration_site_supervisor" m
 WHERE r."id" = m."supervisor_role_id";

DROP TABLE "migration_site_supervisor";
