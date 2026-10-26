-- A Labour on none, one or many Projects (ADR CM-0033). The single
-- `labours.current_project_id` becomes the `labour_projects` join table:
-- each labourer keeps their Project, since the day their history put them
-- there. A Project ticked or unticked on Edit Labour writes a history row
-- with no `from_project_id` or no `to_project_id`, so `to_project_id`
-- becomes optional. Attendance becomes one live row per labourer per
-- Project per day. Written by hand: the data is copied before the column
-- goes. Touches no other schema (ADR-0030).

-- CreateTable
CREATE TABLE "construction_labour"."labour_projects" (
    "workspace_id" TEXT NOT NULL,
    "labour_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "since" DATE NOT NULL,

    CONSTRAINT "labour_projects_pkey" PRIMARY KEY ("labour_id","project_id")
);

-- CreateIndex
CREATE INDEX "labour_projects_workspace_id_project_id_idx" ON "construction_labour"."labour_projects"("workspace_id", "project_id");

-- AddForeignKey
ALTER TABLE "construction_labour"."labour_projects" ADD CONSTRAINT "labour_projects_labour_id_fkey" FOREIGN KEY ("labour_id") REFERENCES "construction_labour"."labours"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Every labourer's current Project, since their latest move to it (the
-- joining date when the history has none).
INSERT INTO "construction_labour"."labour_projects" ("workspace_id", "labour_id", "project_id", "since")
SELECT l."workspace_id",
       l."id",
       l."current_project_id",
       COALESCE(
         (SELECT max(t."transfer_date")
            FROM "construction_labour"."labour_transfers" t
           WHERE t."labour_id" = l."id"
             AND t."to_project_id" = l."current_project_id"),
         l."joining_date"
       )
  FROM "construction_labour"."labours" l;

-- DropIndex
DROP INDEX "construction_labour"."labours_workspace_id_current_project_id_idx";

-- AlterTable
ALTER TABLE "construction_labour"."labours" DROP COLUMN "current_project_id";

-- AlterTable
ALTER TABLE "construction_labour"."labour_transfers" ALTER COLUMN "to_project_id" DROP NOT NULL;

-- A history row moves a labourer onto a Project, off one, or both.
ALTER TABLE "construction_labour"."labour_transfers" ADD CONSTRAINT "labour_transfers_project_check" CHECK ("from_project_id" IS NOT NULL OR "to_project_id" IS NOT NULL);

-- CreateIndex
CREATE INDEX "labour_transfers_workspace_id_from_project_id_idx" ON "construction_labour"."labour_transfers"("workspace_id", "from_project_id");

-- One live attendance row per labourer per Project per day.
DROP INDEX "construction_labour"."labour_attendance_live_day_key";
CREATE UNIQUE INDEX "labour_attendance_live_day_key" ON "construction_labour"."labour_attendance"("labour_id", "project_id", "attendance_date") WHERE "deleted_at" IS NULL;
