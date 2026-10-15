-- Tracking report kinds (CM-805, ADR CM-0019 §14): Task Report, Issue & Snag,
-- Inspection Request and the Task Progress Report. construction_reporting
-- only (ADR-0030).

ALTER TYPE "construction_reporting"."report_kind" ADD VALUE 'task_report';
ALTER TYPE "construction_reporting"."report_kind" ADD VALUE 'issue_snag_report';
ALTER TYPE "construction_reporting"."report_kind" ADD VALUE 'inspection_request_report';
ALTER TYPE "construction_reporting"."report_kind" ADD VALUE 'task_progress_report';
