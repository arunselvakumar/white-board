-- Departments go (ADR CM-0048). construction_tracking only (ADR-0030).
--
-- Business effect: Tasks, Issues & Snags and Inspection Requests have no
-- Department. The Department each one named is dropped with no audit
-- record (the owner's call, CM-0048 §7). The (workspace_id, department_id)
-- indexes go with the columns.

DROP INDEX IF EXISTS "construction_tracking"."tasks_workspace_id_department_id_idx";
DROP INDEX IF EXISTS "construction_tracking"."issues_workspace_id_department_id_idx";
DROP INDEX IF EXISTS "construction_tracking"."inspections_workspace_id_department_id_idx";

ALTER TABLE "construction_tracking"."tasks" DROP COLUMN "department_id";

ALTER TABLE "construction_tracking"."issues" DROP COLUMN "department_id";

ALTER TABLE "construction_tracking"."inspections" DROP COLUMN "department_id";
