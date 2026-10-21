-- A Project's Client and Role (CM-1101, ADR CM-0023 §2). Touches
-- construction_projects only (ADR-0030).

-- CreateEnum
CREATE TYPE "construction_projects"."project_role" AS ENUM ('contract', 'own');

-- AlterTable
ALTER TABLE "construction_projects"."projects" ADD COLUMN     "client_id" UUID,
ADD COLUMN     "role" "construction_projects"."project_role" NOT NULL DEFAULT 'own';

-- Business effect: a Project whose contract details already name a client
-- or a client order becomes Contract work; every other Project stays Own
-- development. No Client record is linked; owners pick one when they bill.
UPDATE "construction_projects"."projects"
SET "role" = 'contract'
WHERE ("client_name" IS NOT NULL AND btrim("client_name") <> '')
   OR ("client_order_no" IS NOT NULL AND btrim("client_order_no") <> '');

CREATE INDEX "projects_workspace_id_client_id_idx" ON "construction_projects"."projects"("workspace_id", "client_id");
