-- Marketing report kinds (ADR CM-0040 §13): the Visit register, the
-- Marketing Person summary and the Company pipeline. construction_reporting
-- only (ADR-0030).

ALTER TYPE "construction_reporting"."report_kind" ADD VALUE IF NOT EXISTS 'marketing_visit_register';
ALTER TYPE "construction_reporting"."report_kind" ADD VALUE IF NOT EXISTS 'marketing_person_summary';
ALTER TYPE "construction_reporting"."report_kind" ADD VALUE IF NOT EXISTS 'marketing_company_pipeline';
