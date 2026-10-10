-- Companies created before M3 get the six seed leave types new Companies
-- receive from the CompanyCreated listener (CM-310; keep in step with
-- apps/construction-management/src/hrms/infrastructure/seeds/leave-types.json).
-- Data only, no schema change. Idempotent: a Company that already has a
-- live leave type of the same name (any case) keeps its own.
INSERT INTO "construction_hrms"."leave_types" (
  "id", "workspace_id", "name", "yearly_limit", "is_paid", "requires_approval",
  "approval_levels", "max_consecutive_days", "carry_forward", "max_carry_forward",
  "accrual_mode", "accrual_frequency", "accrual_day", "credit_per_period",
  "allow_advance_use", "is_active", "is_seed", "created_by", "updated_by"
)
SELECT gen_random_uuid(), p."workspace_id", s."name", s."yearly_limit", s."is_paid", true,
  NULL, NULL, s."carry_forward", s."max_carry_forward",
  s."accrual_mode"::"construction_hrms"."accrual_mode",
  s."accrual_frequency"::"construction_hrms"."accrual_frequency",
  s."accrual_day", s."credit_per_period",
  false, true, true, 'system', 'system'
FROM "construction_organization"."company_profiles" p
CROSS JOIN (VALUES
  ('Casual Leave',     12.00::decimal(6,2), true,  false, NULL::decimal(6,2),  'upfront',  NULL,      NULL::integer, NULL::decimal(6,2)),
  ('Compensatory Off',  0.00::decimal(6,2), true,  false, NULL::decimal(6,2),  'none',     NULL,      NULL::integer, NULL::decimal(6,2)),
  ('Loss of Pay',       0.00::decimal(6,2), false, false, NULL::decimal(6,2),  'none',     NULL,      NULL::integer, NULL::decimal(6,2)),
  ('Maternity',       182.00::decimal(6,2), true,  false, NULL::decimal(6,2),  'periodic', 'monthly', 1,             15.17::decimal(6,2)),
  ('Privilege Leave',  15.00::decimal(6,2), true,  true,  15.00::decimal(6,2), 'periodic', 'monthly', 1,             1.25::decimal(6,2)),
  ('Sick',              7.00::decimal(6,2), true,  false, NULL::decimal(6,2),  'periodic', 'monthly', 1,             0.58::decimal(6,2))
) AS s ("name", "yearly_limit", "is_paid", "carry_forward", "max_carry_forward", "accrual_mode", "accrual_frequency", "accrual_day", "credit_per_period")
WHERE NOT EXISTS (
  SELECT 1 FROM "construction_hrms"."leave_types" t
  WHERE t."workspace_id" = p."workspace_id"
    AND lower(t."name") = lower(s."name")
    AND t."deleted_at" IS NULL
);
