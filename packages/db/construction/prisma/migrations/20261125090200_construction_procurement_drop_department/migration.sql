-- Departments go (ADR CM-0048). construction_procurement only (ADR-0030).
--
-- Business effect: a Material Request has no Department. The Department
-- each request named is dropped with no audit record (CM-0048 §7).

ALTER TABLE "construction_procurement"."material_requests" DROP COLUMN "department_id";
