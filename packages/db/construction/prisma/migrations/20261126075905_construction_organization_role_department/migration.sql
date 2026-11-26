-- A Role may be under a Department (ADR CM-0050). The column is optional:
-- every existing Role stays under no Department, and nothing else changes.
-- Deleting a Department is a soft delete, so the app (not this key) refuses
-- one with live Roles in it; the key keeps a hard delete from orphaning
-- Roles. Touches construction_organization only (ADR-0030).

-- AlterTable
ALTER TABLE "construction_organization"."roles" ADD COLUMN     "department_id" UUID;

-- CreateIndex
CREATE INDEX "roles_department_id_idx" ON "construction_organization"."roles"("department_id");

-- AddForeignKey
ALTER TABLE "construction_organization"."roles" ADD CONSTRAINT "roles_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "construction_organization"."departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
