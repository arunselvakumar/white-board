-- Labours and Site Engineers become Employees (ADR CM-0055).
--
-- Business effect: the app is not in production, and the owner said every
-- Labour and Site Engineer is test data that may go. Every Labour goes,
-- with their Projects, transfers, attendance days and overtime, their
-- ledger entries and wage payments, their documents, and every Check-In
-- of a Labour or a Site Engineer. Vendors and everything of theirs stay.
-- Employees start empty: add them again under Human Resources → Staff →
-- Employees. Photos and documents stay in `stored_files` (and storage)
-- with nothing pointing at them, like any deleted record's.
--
-- Schemas: changes construction_labour only (ADR-0030). One audit event
-- per Company records the counts (shared kernel audit log,
-- `construction_organization.audit_events`). The previous migration removed
-- the Labours' wage payments from the finance accounts; Site Engineers go
-- from `construction_masters` in the next one.

-- 1. Keep a record of what goes.
INSERT INTO "construction_organization"."audit_events"
    ("id", "workspace_id", "actor_user_id", "action", "entity_type", "entity_id", "before", "after", "occurred_at")
SELECT gen_random_uuid(), w."workspace_id", 'system', 'labours.replaced_by_employees', 'workspace', w."workspace_id",
       jsonb_build_object(
         'labours', (SELECT count(*) FROM "construction_labour"."labours" l WHERE l."workspace_id" = w."workspace_id"),
         'attendanceDays', (SELECT count(*) FROM "construction_labour"."labour_attendance" a WHERE a."workspace_id" = w."workspace_id"),
         'wagePayments', (SELECT count(*) FROM "construction_labour"."wage_payments" p WHERE p."workspace_id" = w."workspace_id" AND p."party_type" = 'labour'),
         'checkIns', (SELECT count(*) FROM "construction_labour"."check_in_events" c WHERE c."workspace_id" = w."workspace_id" AND c."person_kind" <> 'vendor')
       ),
       '{}'::jsonb,
       now()
  FROM (SELECT DISTINCT "workspace_id" FROM "construction_labour"."labours"
        UNION SELECT DISTINCT "workspace_id" FROM "construction_labour"."check_in_events" WHERE "person_kind" <> 'vendor') w;

-- 2. What belongs to a Labour or a Site Engineer goes.
DELETE FROM "construction_labour"."check_in_events" WHERE "person_kind" <> 'vendor';
DELETE FROM "construction_labour"."ledger_entries" WHERE "party_type" = 'labour';
DELETE FROM "construction_labour"."wage_payments" WHERE "party_type" = 'labour';
DELETE FROM "construction_labour"."documents" WHERE "owner_type" = 'labour';

DROP TABLE "construction_labour"."labour_overtime";
DROP TABLE "construction_labour"."labour_attendance";
DROP TABLE "construction_labour"."labour_projects";
DROP TABLE "construction_labour"."labour_transfers";
DROP TABLE "construction_labour"."labours";

-- 3. Labour becomes Employee in the enums (only Vendor rows are left).
BEGIN;
CREATE TYPE "construction_labour"."check_in_person_kind_new" AS ENUM ('employee', 'vendor');
ALTER TABLE "construction_labour"."check_in_events" ALTER COLUMN "person_kind" TYPE "construction_labour"."check_in_person_kind_new" USING ("person_kind"::text::"construction_labour"."check_in_person_kind_new");
ALTER TYPE "construction_labour"."check_in_person_kind" RENAME TO "check_in_person_kind_old";
ALTER TYPE "construction_labour"."check_in_person_kind_new" RENAME TO "check_in_person_kind";
DROP TYPE "construction_labour"."check_in_person_kind_old";
COMMIT;

BEGIN;
CREATE TYPE "construction_labour"."document_owner_new" AS ENUM ('employee', 'vendor');
ALTER TABLE "construction_labour"."documents" ALTER COLUMN "owner_type" TYPE "construction_labour"."document_owner_new" USING ("owner_type"::text::"construction_labour"."document_owner_new");
ALTER TYPE "construction_labour"."document_owner" RENAME TO "document_owner_old";
ALTER TYPE "construction_labour"."document_owner_new" RENAME TO "document_owner";
DROP TYPE "construction_labour"."document_owner_old";
COMMIT;

BEGIN;
CREATE TYPE "construction_labour"."party_type_new" AS ENUM ('employee', 'vendor');
ALTER TABLE "construction_labour"."ledger_entries" ALTER COLUMN "party_type" TYPE "construction_labour"."party_type_new" USING ("party_type"::text::"construction_labour"."party_type_new");
ALTER TABLE "construction_labour"."wage_payments" ALTER COLUMN "party_type" TYPE "construction_labour"."party_type_new" USING ("party_type"::text::"construction_labour"."party_type_new");
ALTER TYPE "construction_labour"."party_type" RENAME TO "party_type_old";
ALTER TYPE "construction_labour"."party_type_new" RENAME TO "party_type";
DROP TYPE "construction_labour"."party_type_old";
COMMIT;

-- 4. The Employee tables.
-- CreateTable
CREATE TABLE "construction_labour"."employees" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "employee_code" TEXT,
    "role_id" UUID NOT NULL,
    "team_member_id" UUID,
    "father_name" TEXT,
    "date_of_birth" DATE,
    "gender" "construction_labour"."gender",
    "blood_group" VARCHAR(3),
    "joining_date" DATE NOT NULL,
    "mobile" TEXT,
    "email" TEXT,
    "address" TEXT,
    "emergency_contact" TEXT,
    "qualification" TEXT,
    "experience_years" INTEGER,
    "specialisation" TEXT,
    "wage_type" "construction_labour"."wage_type" NOT NULL,
    "wage_per_day" INTEGER,
    "wage_per_month" INTEGER,
    "overtime_wage_per_hour" INTEGER NOT NULL,
    "working_hours_per_day" DECIMAL(4,2) NOT NULL DEFAULT 8,
    "weekly_holidays" INTEGER[],
    "uan_number" VARCHAR(12),
    "esic_number" VARCHAR(17),
    "aadhaar_encrypted" TEXT,
    "aadhaar_last4" CHAR(4),
    "pan_encrypted" TEXT,
    "pan_last4" CHAR(4),
    "bank_account_holder" TEXT,
    "bank_account_encrypted" TEXT,
    "bank_account_last4" VARCHAR(4),
    "bank_ifsc" VARCHAR(11),
    "bank_name" TEXT,
    "labour_category_id" UUID,
    "reports_to_id" UUID,
    "photo_key" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_by" TEXT NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "deleted_by" TEXT,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "construction_labour"."employee_projects" (
    "workspace_id" TEXT NOT NULL,
    "employee_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "since" DATE NOT NULL,

    CONSTRAINT "employee_projects_pkey" PRIMARY KEY ("employee_id","project_id")
);

-- CreateTable
CREATE TABLE "construction_labour"."employee_transfers" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "employee_id" UUID NOT NULL,
    "from_project_id" UUID,
    "to_project_id" UUID,
    "transfer_date" DATE NOT NULL,
    "remark" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,

    CONSTRAINT "employee_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "construction_labour"."employee_attendance" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "project_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "attendance_date" DATE NOT NULL,
    "status" "construction_labour"."attendance_status" NOT NULL,
    "is_paid_leave" BOOLEAN NOT NULL DEFAULT false,
    "shift" TEXT,
    "check_in" CHAR(5),
    "check_out" CHAR(5),
    "break_minutes" INTEGER,
    "working_hours" DECIMAL(4,2) NOT NULL DEFAULT 8,
    "wage_type" "construction_labour"."wage_type" NOT NULL,
    "wage_rate" INTEGER NOT NULL,
    "earned" INTEGER NOT NULL,
    "from_check_in" BOOLEAN NOT NULL DEFAULT false,
    "times_from_check_in" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_by" TEXT NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "deleted_by" TEXT,

    CONSTRAINT "employee_attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "construction_labour"."employee_overtime" (
    "id" UUID NOT NULL,
    "attendance_id" UUID NOT NULL,
    "labour_category_id" UUID,
    "hours" DECIMAL(4,2) NOT NULL,
    "rate_per_hour" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL,
    "from_times" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "employee_overtime_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "employees_team_member_id_key" ON "construction_labour"."employees"("team_member_id");

-- CreateIndex
CREATE INDEX "employees_workspace_id_name_idx" ON "construction_labour"."employees"("workspace_id", "name");

-- CreateIndex
CREATE INDEX "employees_workspace_id_role_id_idx" ON "construction_labour"."employees"("workspace_id", "role_id");

-- CreateIndex
CREATE INDEX "employees_reports_to_id_idx" ON "construction_labour"."employees"("reports_to_id");

-- CreateIndex
CREATE INDEX "employee_projects_workspace_id_project_id_idx" ON "construction_labour"."employee_projects"("workspace_id", "project_id");

-- CreateIndex
CREATE INDEX "employee_transfers_employee_id_transfer_date_idx" ON "construction_labour"."employee_transfers"("employee_id", "transfer_date");

-- CreateIndex
CREATE INDEX "employee_transfers_workspace_id_to_project_id_idx" ON "construction_labour"."employee_transfers"("workspace_id", "to_project_id");

-- CreateIndex
CREATE INDEX "employee_transfers_workspace_id_from_project_id_idx" ON "construction_labour"."employee_transfers"("workspace_id", "from_project_id");

-- CreateIndex
CREATE INDEX "employee_attendance_workspace_id_project_id_attendance_date_idx" ON "construction_labour"."employee_attendance"("workspace_id", "project_id", "attendance_date");

-- CreateIndex
CREATE INDEX "employee_attendance_employee_id_attendance_date_idx" ON "construction_labour"."employee_attendance"("employee_id", "attendance_date");

-- CreateIndex
CREATE INDEX "employee_overtime_attendance_id_idx" ON "construction_labour"."employee_overtime"("attendance_id");

-- AddForeignKey
ALTER TABLE "construction_labour"."employees" ADD CONSTRAINT "employees_reports_to_id_fkey" FOREIGN KEY ("reports_to_id") REFERENCES "construction_labour"."employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "construction_labour"."employee_projects" ADD CONSTRAINT "employee_projects_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "construction_labour"."employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "construction_labour"."employee_transfers" ADD CONSTRAINT "employee_transfers_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "construction_labour"."employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "construction_labour"."employee_attendance" ADD CONSTRAINT "employee_attendance_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "construction_labour"."employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "construction_labour"."employee_overtime" ADD CONSTRAINT "employee_overtime_attendance_id_fkey" FOREIGN KEY ("attendance_id") REFERENCES "construction_labour"."employee_attendance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 5. Rules Prisma cannot express.
-- The Company's own Employee Id is unique among live Employees.
CREATE UNIQUE INDEX "employees_live_code_key" ON "construction_labour"."employees"("workspace_id", lower("employee_code")) WHERE "deleted_at" IS NULL AND "employee_code" IS NOT NULL;
-- One live attendance day per Employee per Project per date.
CREATE UNIQUE INDEX "employee_attendance_live_day_key" ON "construction_labour"."employee_attendance"("employee_id", "project_id", "attendance_date") WHERE "deleted_at" IS NULL;

ALTER TABLE "construction_labour"."employees" ADD CONSTRAINT "employees_working_hours_check" CHECK ("working_hours_per_day" > 0 AND "working_hours_per_day" <= 24);
ALTER TABLE "construction_labour"."employees" ADD CONSTRAINT "employees_wages_check" CHECK (
  "overtime_wage_per_hour" >= 0
  AND ("wage_type" <> 'daily' OR ("wage_per_day" IS NOT NULL AND "wage_per_day" >= 0))
  AND ("wage_type" <> 'monthly' OR ("wage_per_month" IS NOT NULL AND "wage_per_month" >= 0))
);
ALTER TABLE "construction_labour"."employees" ADD CONSTRAINT "employees_experience_check" CHECK ("experience_years" IS NULL OR ("experience_years" >= 0 AND "experience_years" <= 80));
ALTER TABLE "construction_labour"."employee_transfers" ADD CONSTRAINT "employee_transfers_project_check" CHECK ("from_project_id" IS NOT NULL OR "to_project_id" IS NOT NULL);
ALTER TABLE "construction_labour"."employee_attendance" ADD CONSTRAINT "employee_attendance_times_check" CHECK (
  ("check_in" IS NULL OR "check_in" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
  AND ("check_out" IS NULL OR "check_out" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
  AND ("check_out" IS NULL OR "check_in" IS NOT NULL)
  AND ("check_in" IS NULL OR "status" IN ('present', 'half_day'))
  AND (("check_in" IS NULL) = ("break_minutes" IS NULL))
  AND ("break_minutes" IS NULL OR ("break_minutes" >= 0 AND "break_minutes" <= 720))
  AND "working_hours" > 0 AND "working_hours" <= 24
);
ALTER TABLE "construction_labour"."employee_attendance" ADD CONSTRAINT "employee_attendance_check_in_times_check" CHECK (
  NOT "times_from_check_in" OR "check_in" IS NOT NULL
);
ALTER TABLE "construction_labour"."employee_overtime" ADD CONSTRAINT "employee_overtime_hours_check" CHECK ("hours" > 0 AND "hours" <= 24 AND "rate_per_hour" >= 0);
