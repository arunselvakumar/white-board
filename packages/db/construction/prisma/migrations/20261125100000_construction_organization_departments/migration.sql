-- Manage Departments (ADR CM-0049): the Company's list of departments, with
-- Human Resources and Marketing as system departments in every Company, and
-- the Departments menu (`organization.departments`) for the seeded Admin.
-- Touches construction_organization only (ADR-0030).
--
-- Flag bits (src/shared-kernel/access/flags.ts): create 1, read 2,
-- update 4, delete 8.

-- 1. The table.

-- CreateTable
CREATE TABLE "construction_organization"."departments" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_by" TEXT NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "deleted_by" TEXT,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "departments_workspace_id_idx" ON "construction_organization"."departments"("workspace_id");

-- A name is used once among a Company's live departments, ignoring case.
CREATE UNIQUE INDEX "departments_live_name_key" ON "construction_organization"."departments"("workspace_id", lower("name")) WHERE "deleted_at" IS NULL;

-- 2. Human Resources and Marketing in every existing Company. Every Company
-- has a Team Member: its Owner.

-- System departments
INSERT INTO "construction_organization"."departments"
    ("id", "workspace_id", "name", "is_system", "created_by", "updated_by")
SELECT gen_random_uuid(), c."workspace_id", d."name", true, 'system', 'system'
  FROM (SELECT DISTINCT "workspace_id" FROM "construction_organization"."team_members") c,
       (VALUES ('Human Resources'), ('Marketing')) AS d("name");

-- 3. Every Departments cell for the seeded Admin, as a new Company's Admin
-- gets from "ALL".

-- Admin cells
INSERT INTO "construction_organization"."role_menu_permissions"
    ("workspace_id", "role_id", "menu", "flags", "updated_by")
SELECT r."workspace_id", r."id", 'organization.departments', 15, 'system'
  FROM "construction_organization"."roles" r
 WHERE r."is_seed"
   AND r."deleted_at" IS NULL
   AND r."name" = 'Admin'
ON CONFLICT ("role_id", "menu") DO UPDATE
   SET "flags" = "construction_organization"."role_menu_permissions"."flags" | EXCLUDED."flags",
       "updated_at" = now(),
       "updated_by" = 'system';
