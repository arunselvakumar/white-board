-- CM-315: the identifiers PF and ESI returns need (CM-320) sit on the
-- member's salary configuration, beside the gender PT slabs read.
ALTER TABLE "construction_hrms"."employee_salary_configs"
  ADD COLUMN "uan" CHAR(12),
  ADD COLUMN "esi_ip_number" CHAR(10);

ALTER TABLE "construction_hrms"."employee_salary_configs" ADD CONSTRAINT "employee_salary_configs_identifiers_check" CHECK (
  ("uan" IS NULL OR "uan" ~ '^[0-9]{12}$')
  AND ("esi_ip_number" IS NULL OR "esi_ip_number" ~ '^[0-9]{10}$')
);
