-- Daily site work (CM-605, CM-606, CM-608, ADR CM-0016 §15, §16): report
-- kinds for the Daily Progress Report, Daily Work, Company Owned and Rented
-- Equipment Usage, Equipment Maintenance and Equipment Transfers.
-- Touches construction_reporting only (ADR-0030).

-- AlterEnum
ALTER TYPE "construction_reporting"."report_kind" ADD VALUE 'daily_progress_report';
ALTER TYPE "construction_reporting"."report_kind" ADD VALUE 'daily_work';
ALTER TYPE "construction_reporting"."report_kind" ADD VALUE 'owned_equipment_usage';
ALTER TYPE "construction_reporting"."report_kind" ADD VALUE 'rented_equipment_usage';
ALTER TYPE "construction_reporting"."report_kind" ADD VALUE 'equipment_maintenance';
ALTER TYPE "construction_reporting"."report_kind" ADD VALUE 'equipment_transfers';
