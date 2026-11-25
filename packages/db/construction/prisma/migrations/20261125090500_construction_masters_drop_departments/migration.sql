-- Departments go (ADR CM-0048). construction_masters only (ADR-0030). Runs
-- after the other contexts' migrations, which dropped every column that
-- held a Department id.
--
-- Business effect: there is no Department master. Work Types are one flat
-- list and Contractors have no Departments. Every Company's Departments,
-- seeded or added, and each Contractor's list of them are dropped with no
-- audit record (the owner's call, CM-0048 §7).

ALTER TABLE "construction_masters"."work_types" DROP CONSTRAINT "work_types_department_id_fkey";
DROP INDEX IF EXISTS "construction_masters"."work_types_department_id_idx";
ALTER TABLE "construction_masters"."work_types" DROP COLUMN "department_id";

DROP TABLE "construction_masters"."contractor_departments";

DROP TABLE "construction_masters"."departments";
