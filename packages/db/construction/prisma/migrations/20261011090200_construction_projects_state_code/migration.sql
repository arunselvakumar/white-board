-- A Project's GST state, the place of supply of its Purchase Orders
-- (ADR CM-0015 §6). Optional; existing Projects stay unknown. Touches no
-- other schema (ADR-0030).

-- AlterTable
ALTER TABLE "construction_projects"."projects" ADD COLUMN     "state_code" CHAR(2);
