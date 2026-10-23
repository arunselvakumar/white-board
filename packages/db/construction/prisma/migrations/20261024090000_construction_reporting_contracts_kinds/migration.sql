-- Contracts report kinds (CM-1111, ADR CM-0023): BOQ vs executed, the Work
-- Order register, the RA bill register of each side, the deductions and
-- retention registers, material reconciliation and Variations.
-- construction_reporting only (ADR-0030).

ALTER TYPE "construction_reporting"."report_kind" ADD VALUE 'boq_vs_executed';
ALTER TYPE "construction_reporting"."report_kind" ADD VALUE 'work_order_register';
ALTER TYPE "construction_reporting"."report_kind" ADD VALUE 'contractor_bill_register';
ALTER TYPE "construction_reporting"."report_kind" ADD VALUE 'client_bill_register';
ALTER TYPE "construction_reporting"."report_kind" ADD VALUE 'deductions_register';
ALTER TYPE "construction_reporting"."report_kind" ADD VALUE 'retention_register';
ALTER TYPE "construction_reporting"."report_kind" ADD VALUE 'material_reconciliation';
ALTER TYPE "construction_reporting"."report_kind" ADD VALUE 'variations_register';
