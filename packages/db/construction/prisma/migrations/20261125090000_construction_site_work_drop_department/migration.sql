-- Departments go (ADR CM-0048). construction_site_work only (ADR-0030).
--
-- Business effect: a Daily Worksheet is filed by Contractor and Work Type,
-- and an Equipment Usage sheet has no Department. The Department each sheet
-- named is dropped with no audit record (the owner's call, CM-0048 §7).
-- No foreign key, view or index in another schema points at these columns.

ALTER TABLE "construction_site_work"."worksheets" DROP COLUMN "department_id";

ALTER TABLE "construction_site_work"."equipment_usage_sheets" DROP COLUMN "department_id";
