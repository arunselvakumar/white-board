-- Roles replace per-member matrices and Designation templates (ADR CM-0029).
-- construction_organization only (ADR-0030).
--
-- Business effect: until now each Team Member had their own Permission
-- Matrix (member_menu_permissions), copied from their Designation's
-- Permission Template when they were added. From now on a Team Member has
-- one Role, and the Role holds the matrix; editing a Role changes access for
-- everyone on it. Nobody's access changes in this migration:
--
--   1. Each Company gets one Role per live Designation that has a template,
--      with the same name and matrix, plus "HRMS Staff" (the HRMS default
--      set, src/shared-kernel/access hrmsDefaultPermissions) unless a Role
--      of that name already came from a Designation.
--   2. Each live Team Member other than the Owner goes on the Role whose
--      matrix equals theirs: their own Designation's Role first, then any
--      other Role of the Company (by name). Members whose matrix matches no
--      Role get one made from it, named "<earliest member's name>'s access";
--      members with the same unmatched matrix share it.
--   3. Every Role that could update Team Members also gets Role Management
--      (organization.roles: create, read, update, delete = 15), so whoever
--      could set access before still can.
--   4. The old grants and templates are kept as audit events, then
--      member_menu_permissions and designations.permission_template go.
--
-- Matrices are compared as jsonb objects { menu: flags } with zero cells
-- dropped, so key order and empty cells do not matter. The Owner keeps no
-- Role: they can do everything (ADR CM-0003).

-- CreateTable
CREATE TABLE "construction_organization"."roles" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_seed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_by" TEXT NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "construction_organization"."role_menu_permissions" (
    "workspace_id" TEXT NOT NULL,
    "role_id" UUID NOT NULL,
    "menu" TEXT NOT NULL,
    "flags" INTEGER NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" TEXT NOT NULL,

    CONSTRAINT "role_menu_permissions_pkey" PRIMARY KEY ("role_id","menu")
);

-- AlterTable
ALTER TABLE "construction_organization"."team_members" ADD COLUMN "role_id" UUID;

-- CreateIndex
CREATE INDEX "roles_workspace_id_idx" ON "construction_organization"."roles"("workspace_id");

-- Role names are unique among a Company's live Roles, ignoring case.
CREATE UNIQUE INDEX "roles_live_name_key" ON "construction_organization"."roles"("workspace_id", lower("name")) WHERE "deleted_at" IS NULL;

-- CreateIndex
CREATE INDEX "role_menu_permissions_workspace_id_menu_idx" ON "construction_organization"."role_menu_permissions"("workspace_id", "menu");

-- CreateIndex
CREATE INDEX "team_members_role_id_idx" ON "construction_organization"."team_members"("role_id");

-- AddForeignKey
ALTER TABLE "construction_organization"."role_menu_permissions" ADD CONSTRAINT "role_menu_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "construction_organization"."roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "construction_organization"."team_members" ADD CONSTRAINT "team_members_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "construction_organization"."roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 1. Roles from Designation templates, and HRMS Staff.

CREATE TEMPORARY TABLE "migration_role_matrix" (
    "role_id" UUID PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "designation_id" UUID,
    "is_seed" BOOLEAN NOT NULL,
    "matrix" JSONB NOT NULL
);

INSERT INTO "migration_role_matrix"
SELECT
    gen_random_uuid(),
    d."workspace_id",
    d."name",
    d."id",
    d."is_seed",
    COALESCE(
        (SELECT jsonb_object_agg(cell.key, (cell.value #>> '{}')::int)
           FROM jsonb_each(d."permission_template") AS cell
          WHERE (cell.value #>> '{}')::int <> 0),
        '{}'::jsonb)
FROM "construction_organization"."designations" d
WHERE d."deleted_at" IS NULL
  AND d."permission_template" IS NOT NULL
  AND jsonb_typeof(d."permission_template") = 'object';

INSERT INTO "migration_role_matrix"
SELECT
    gen_random_uuid(),
    companies."workspace_id",
    'HRMS Staff',
    NULL,
    TRUE,
    '{"hrms.hrms": 2, "hrms.holidays": 2, "hrms.attendance": 515, "hrms.leaves": 515, "hrms.salaries": 2}'::jsonb
FROM (SELECT DISTINCT "workspace_id" FROM "construction_organization"."designations") AS companies
WHERE NOT EXISTS (
    SELECT 1 FROM "migration_role_matrix" r
     WHERE r."workspace_id" = companies."workspace_id"
       AND lower(r."name") = 'hrms staff');

-- 2. Each live non-Owner Team Member's matrix.

CREATE TEMPORARY TABLE "migration_member_matrix" (
    "member_id" UUID PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "designation_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "matrix" JSONB NOT NULL,
    "role_id" UUID
);

INSERT INTO "migration_member_matrix"
SELECT
    m."id",
    m."workspace_id",
    m."name",
    m."designation_id",
    m."created_at",
    COALESCE(
        (SELECT jsonb_object_agg(p."menu", p."flags")
           FROM "construction_organization"."member_menu_permissions" p
          WHERE p."member_id" = m."id" AND p."flags" <> 0),
        '{}'::jsonb),
    NULL
FROM "construction_organization"."team_members" m
WHERE m."deleted_at" IS NULL AND NOT m."is_owner";

-- Their own Designation's Role first.
UPDATE "migration_member_matrix" mm
   SET "role_id" = r."role_id"
  FROM "migration_role_matrix" r
 WHERE r."designation_id" = mm."designation_id"
   AND r."matrix" = mm."matrix";

-- Then any Role of the Company with the same matrix.
UPDATE "migration_member_matrix" mm
   SET "role_id" = (
       SELECT r."role_id" FROM "migration_role_matrix" r
        WHERE r."workspace_id" = mm."workspace_id" AND r."matrix" = mm."matrix"
        ORDER BY lower(r."name"), r."role_id"
        LIMIT 1)
 WHERE mm."role_id" IS NULL;

-- Then one Role per remaining (Company, matrix), named after its earliest
-- member. A name already taken gets the Role id's first 8 characters.
WITH "unmatched" AS (
    SELECT DISTINCT ON (mm."workspace_id", mm."matrix")
           mm."workspace_id", mm."matrix", mm."name" || '''s access' AS "base"
      FROM "migration_member_matrix" mm
     WHERE mm."role_id" IS NULL
     ORDER BY mm."workspace_id", mm."matrix", mm."created_at", mm."member_id"
), "numbered" AS (
    SELECT u.*, gen_random_uuid() AS "role_id",
           row_number() OVER (PARTITION BY u."workspace_id", lower(u."base") ORDER BY u."matrix"::text) AS "n"
      FROM "unmatched" u
)
INSERT INTO "migration_role_matrix"
SELECT
    n."role_id",
    n."workspace_id",
    CASE
        WHEN n."n" = 1 AND NOT EXISTS (
            SELECT 1 FROM "migration_role_matrix" r
             WHERE r."workspace_id" = n."workspace_id" AND lower(r."name") = lower(n."base"))
        THEN n."base"
        ELSE n."base" || ' (' || left(n."role_id"::text, 8) || ')'
    END,
    NULL,
    FALSE,
    n."matrix"
FROM "numbered" n;

UPDATE "migration_member_matrix" mm
   SET "role_id" = (
       SELECT r."role_id" FROM "migration_role_matrix" r
        WHERE r."workspace_id" = mm."workspace_id" AND r."matrix" = mm."matrix"
        ORDER BY r."designation_id" IS NULL, lower(r."name"), r."role_id"
        LIMIT 1)
 WHERE mm."role_id" IS NULL;

-- Write the Roles, their cells and the members' Role.

INSERT INTO "construction_organization"."roles"
    ("id", "workspace_id", "name", "is_seed", "created_by", "updated_by")
SELECT r."role_id", r."workspace_id", r."name", r."is_seed", 'system', 'system'
  FROM "migration_role_matrix" r;

INSERT INTO "construction_organization"."role_menu_permissions"
    ("workspace_id", "role_id", "menu", "flags", "updated_by")
SELECT r."workspace_id", r."role_id", cell.key, (cell.value #>> '{}')::int, 'system'
  FROM "migration_role_matrix" r, jsonb_each(r."matrix") AS cell;

UPDATE "construction_organization"."team_members" m
   SET "role_id" = mm."role_id"
  FROM "migration_member_matrix" mm
 WHERE mm."member_id" = m."id";

-- 3. Role Management for every Role that could update Team Members
-- (update = bit 2, value 4; CRUD = 15).
INSERT INTO "construction_organization"."role_menu_permissions"
    ("workspace_id", "role_id", "menu", "flags", "updated_by")
SELECT p."workspace_id", p."role_id", 'organization.roles', 15, 'system'
  FROM "construction_organization"."role_menu_permissions" p
 WHERE p."menu" = 'organization.team_members' AND (p."flags" & 4) <> 0
ON CONFLICT ("role_id", "menu") DO UPDATE SET "flags" = "construction_organization"."role_menu_permissions"."flags" | 15;

-- 4. Keep what goes as audit events, then drop it.
INSERT INTO "construction_organization"."audit_events"
    ("id", "workspace_id", "actor_user_id", "action", "entity_type", "entity_id", "before", "after", "occurred_at")
SELECT gen_random_uuid(), mm."workspace_id", 'system', 'team_member.moved_to_role', 'team_member', mm."member_id"::text,
       jsonb_build_object('permissions', mm."matrix"),
       jsonb_build_object('roleId', mm."role_id"),
       now()
  FROM "migration_member_matrix" mm;

INSERT INTO "construction_organization"."audit_events"
    ("id", "workspace_id", "actor_user_id", "action", "entity_type", "entity_id", "before", "after", "occurred_at")
SELECT gen_random_uuid(), d."workspace_id", 'system', 'designation.template_moved_to_role', 'designation', d."id"::text,
       jsonb_build_object('permissionTemplate', d."permission_template"),
       jsonb_build_object('roleId', r."role_id"),
       now()
  FROM "construction_organization"."designations" d
  LEFT JOIN "migration_role_matrix" r ON r."designation_id" = d."id"
 WHERE d."permission_template" IS NOT NULL;

-- DropTable
DROP TABLE "construction_organization"."member_menu_permissions";

-- AlterTable
ALTER TABLE "construction_organization"."designations" DROP COLUMN "permission_template";

DROP TABLE "migration_member_matrix";
DROP TABLE "migration_role_matrix";
