-- A staff member's monthly salary, entered on Add Staff or Edit Staff
-- (ADR CM-0032). Optional: existing staff have none. Only people with the
-- new Financial flag on Staff (`organization.team_members`) see or set it.
-- Touches no other schema (ADR-0030).

-- AlterTable
ALTER TABLE "construction_organization"."team_members" ADD COLUMN     "monthly_salary" INTEGER;

-- Grant the new cell to the seeded Roles that have it in `seeds/roles.json`
-- (ADR CM-0024): Admin, which holds every cell. Financial is bit 11
-- (value 2048). A Role whose Staff row the Owner removed gets nothing.
UPDATE "construction_organization"."role_menu_permissions" p
   SET "flags" = p."flags" | 2048, "updated_at" = now(), "updated_by" = 'system'
  FROM "construction_organization"."roles" r
 WHERE r."id" = p."role_id"
   AND r."is_seed"
   AND r."deleted_at" IS NULL
   AND r."name" IN ('Admin')
   AND p."menu" = 'organization.team_members';
