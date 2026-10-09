-- M2 site workforce (CM-202): masters (labour subset), minimal projects,
-- labour and vendor registers, attendance, ledgers and wage payments.
-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "construction_labour";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "construction_masters";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "construction_projects";

-- CreateEnum
CREATE TYPE "construction_labour"."wage_type" AS ENUM ('daily', 'monthly');

-- CreateEnum
CREATE TYPE "construction_labour"."gender" AS ENUM ('male', 'female', 'other');

-- CreateEnum
CREATE TYPE "construction_labour"."attendance_status" AS ENUM ('present', 'half_day', 'absent', 'on_leave', 'holiday');

-- CreateEnum
CREATE TYPE "construction_labour"."party_type" AS ENUM ('labour', 'vendor');

-- CreateEnum
CREATE TYPE "construction_labour"."ledger_entry_kind" AS ENUM ('opening', 'earned', 'overtime', 'payment', 'advance');

-- CreateEnum
CREATE TYPE "construction_labour"."payment_kind" AS ENUM ('payment', 'advance');

-- CreateEnum
CREATE TYPE "construction_labour"."payment_mode" AS ENUM ('cash', 'bank');

-- CreateEnum
CREATE TYPE "construction_labour"."document_owner" AS ENUM ('labour', 'vendor');

-- CreateEnum
CREATE TYPE "construction_projects"."project_status" AS ENUM ('not_started', 'ongoing', 'on_hold', 'completed');

-- CreateTable
CREATE TABLE "construction_labour"."labours" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "labour_code" TEXT,
    "father_name" TEXT,
    "joining_date" DATE NOT NULL,
    "wage_type" "construction_labour"."wage_type" NOT NULL,
    "wage_per_day" INTEGER,
    "wage_per_month" INTEGER,
    "overtime_wage_per_hour" INTEGER NOT NULL,
    "weekly_holidays" INTEGER[],
    "uan_number" VARCHAR(12),
    "esic_number" VARCHAR(17),
    "aadhaar_encrypted" TEXT,
    "aadhaar_last4" CHAR(4),
    "labour_category_id" UUID,
    "supervisor_id" UUID,
    "contact_number" TEXT,
    "gender" "construction_labour"."gender",
    "photo_key" TEXT,
    "current_project_id" UUID NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_by" TEXT NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "deleted_by" TEXT,

    CONSTRAINT "labours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "construction_labour"."labour_transfers" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "labour_id" UUID NOT NULL,
    "from_project_id" UUID,
    "to_project_id" UUID NOT NULL,
    "transfer_date" DATE NOT NULL,
    "remark" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,

    CONSTRAINT "labour_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "construction_labour"."labour_attendance" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "project_id" UUID NOT NULL,
    "labour_id" UUID NOT NULL,
    "attendance_date" DATE NOT NULL,
    "status" "construction_labour"."attendance_status" NOT NULL,
    "is_paid_leave" BOOLEAN NOT NULL DEFAULT false,
    "shift" TEXT,
    "supervisor_id" UUID,
    "wage_type" "construction_labour"."wage_type" NOT NULL,
    "wage_rate" INTEGER NOT NULL,
    "earned" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_by" TEXT NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "deleted_by" TEXT,

    CONSTRAINT "labour_attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "construction_labour"."labour_overtime" (
    "id" UUID NOT NULL,
    "attendance_id" UUID NOT NULL,
    "labour_category_id" UUID,
    "hours" DECIMAL(4,2) NOT NULL,
    "rate_per_hour" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL,

    CONSTRAINT "labour_overtime_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "construction_labour"."vendors" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "joining_date" DATE NOT NULL,
    "contact_number" TEXT,
    "address" TEXT,
    "photo_key" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_by" TEXT NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "deleted_by" TEXT,

    CONSTRAINT "vendors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "construction_labour"."vendor_projects" (
    "vendor_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,

    CONSTRAINT "vendor_projects_pkey" PRIMARY KEY ("vendor_id","project_id")
);

-- CreateTable
CREATE TABLE "construction_labour"."vendor_shifts" (
    "id" UUID NOT NULL,
    "vendor_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "start_time" CHAR(5),
    "end_time" CHAR(5),
    "sort_order" INTEGER NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "vendor_shifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "construction_labour"."vendor_rates" (
    "id" UUID NOT NULL,
    "shift_id" UUID NOT NULL,
    "labour_category_id" UUID NOT NULL,
    "rate_per_day" INTEGER NOT NULL,
    "overtime_per_hour" INTEGER NOT NULL,

    CONSTRAINT "vendor_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "construction_labour"."vendor_attendance" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "project_id" UUID NOT NULL,
    "vendor_id" UUID NOT NULL,
    "attendance_date" DATE NOT NULL,
    "total_pay" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_by" TEXT NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "deleted_by" TEXT,

    CONSTRAINT "vendor_attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "construction_labour"."vendor_attendance_lines" (
    "id" UUID NOT NULL,
    "attendance_id" UUID NOT NULL,
    "shift_id" UUID NOT NULL,
    "shift_name" TEXT NOT NULL,
    "labour_category_id" UUID NOT NULL,
    "full_day_count" INTEGER NOT NULL,
    "half_day_count" INTEGER NOT NULL,
    "overtime_hours" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "rate_per_day" INTEGER NOT NULL,
    "overtime_per_hour" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL,

    CONSTRAINT "vendor_attendance_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "construction_labour"."ledger_entries" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "party_type" "construction_labour"."party_type" NOT NULL,
    "party_id" UUID NOT NULL,
    "project_id" UUID,
    "entry_date" DATE NOT NULL,
    "kind" "construction_labour"."ledger_entry_kind" NOT NULL,
    "amount" INTEGER NOT NULL,
    "source_type" TEXT NOT NULL,
    "source_id" UUID NOT NULL,
    "reverses_entry_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,

    CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "construction_labour"."wage_payments" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "party_type" "construction_labour"."party_type" NOT NULL,
    "party_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "payment_date" DATE NOT NULL,
    "kind" "construction_labour"."payment_kind" NOT NULL,
    "mode" "construction_labour"."payment_mode" NOT NULL,
    "reference" TEXT,
    "amount" INTEGER NOT NULL,
    "paid_by_member_id" UUID,
    "remarks" TEXT,
    "document_key" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_by" TEXT NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "deleted_by" TEXT,

    CONSTRAINT "wage_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "construction_labour"."documents" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "owner_type" "construction_labour"."document_owner" NOT NULL,
    "owner_id" UUID NOT NULL,
    "file_key" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "construction_masters"."labour_categories" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_seed" BOOLEAN NOT NULL DEFAULT false,
    "disabled_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_by" TEXT NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "deleted_by" TEXT,

    CONSTRAINT "labour_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "construction_masters"."departments" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_seed" BOOLEAN NOT NULL DEFAULT false,
    "disabled_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_by" TEXT NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "deleted_by" TEXT,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "construction_masters"."supervisors" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mobile" TEXT,
    "team_member_id" UUID,
    "disabled_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_by" TEXT NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "deleted_by" TEXT,

    CONSTRAINT "supervisors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "construction_projects"."projects" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "construction_projects"."project_status" NOT NULL DEFAULT 'ongoing',
    "address" TEXT,
    "start_date" DATE,
    "end_date" DATE,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_by" TEXT NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "deleted_by" TEXT,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "labours_workspace_id_current_project_id_idx" ON "construction_labour"."labours"("workspace_id", "current_project_id");

-- CreateIndex
CREATE INDEX "labours_workspace_id_name_idx" ON "construction_labour"."labours"("workspace_id", "name");

-- CreateIndex
CREATE INDEX "labour_transfers_labour_id_transfer_date_idx" ON "construction_labour"."labour_transfers"("labour_id", "transfer_date");

-- CreateIndex
CREATE INDEX "labour_transfers_workspace_id_to_project_id_idx" ON "construction_labour"."labour_transfers"("workspace_id", "to_project_id");

-- CreateIndex
CREATE INDEX "labour_attendance_workspace_id_project_id_attendance_date_idx" ON "construction_labour"."labour_attendance"("workspace_id", "project_id", "attendance_date");

-- CreateIndex
CREATE INDEX "labour_attendance_labour_id_attendance_date_idx" ON "construction_labour"."labour_attendance"("labour_id", "attendance_date");

-- CreateIndex
CREATE INDEX "labour_overtime_attendance_id_idx" ON "construction_labour"."labour_overtime"("attendance_id");

-- CreateIndex
CREATE INDEX "vendors_workspace_id_name_idx" ON "construction_labour"."vendors"("workspace_id", "name");

-- CreateIndex
CREATE INDEX "vendor_projects_project_id_idx" ON "construction_labour"."vendor_projects"("project_id");

-- CreateIndex
CREATE INDEX "vendor_shifts_vendor_id_idx" ON "construction_labour"."vendor_shifts"("vendor_id");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_rates_shift_id_labour_category_id_key" ON "construction_labour"."vendor_rates"("shift_id", "labour_category_id");

-- CreateIndex
CREATE INDEX "vendor_attendance_workspace_id_project_id_attendance_date_idx" ON "construction_labour"."vendor_attendance"("workspace_id", "project_id", "attendance_date");

-- CreateIndex
CREATE INDEX "vendor_attendance_vendor_id_attendance_date_idx" ON "construction_labour"."vendor_attendance"("vendor_id", "attendance_date");

-- CreateIndex
CREATE INDEX "vendor_attendance_lines_attendance_id_idx" ON "construction_labour"."vendor_attendance_lines"("attendance_id");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_entries_reverses_entry_id_key" ON "construction_labour"."ledger_entries"("reverses_entry_id");

-- CreateIndex
CREATE INDEX "ledger_entries_workspace_id_party_type_party_id_entry_date_idx" ON "construction_labour"."ledger_entries"("workspace_id", "party_type", "party_id", "entry_date");

-- CreateIndex
CREATE INDEX "ledger_entries_workspace_id_project_id_entry_date_idx" ON "construction_labour"."ledger_entries"("workspace_id", "project_id", "entry_date");

-- CreateIndex
CREATE INDEX "ledger_entries_source_type_source_id_idx" ON "construction_labour"."ledger_entries"("source_type", "source_id");

-- CreateIndex
CREATE INDEX "wage_payments_workspace_id_project_id_payment_date_idx" ON "construction_labour"."wage_payments"("workspace_id", "project_id", "payment_date");

-- CreateIndex
CREATE INDEX "wage_payments_workspace_id_party_type_party_id_idx" ON "construction_labour"."wage_payments"("workspace_id", "party_type", "party_id");

-- CreateIndex
CREATE UNIQUE INDEX "documents_file_key_key" ON "construction_labour"."documents"("file_key");

-- CreateIndex
CREATE INDEX "documents_workspace_id_owner_type_owner_id_idx" ON "construction_labour"."documents"("workspace_id", "owner_type", "owner_id");

-- CreateIndex
CREATE INDEX "labour_categories_workspace_id_idx" ON "construction_masters"."labour_categories"("workspace_id");

-- CreateIndex
CREATE INDEX "departments_workspace_id_idx" ON "construction_masters"."departments"("workspace_id");

-- CreateIndex
CREATE INDEX "supervisors_workspace_id_idx" ON "construction_masters"."supervisors"("workspace_id");

-- CreateIndex
CREATE INDEX "projects_workspace_id_status_idx" ON "construction_projects"."projects"("workspace_id", "status");

-- AddForeignKey
ALTER TABLE "construction_labour"."labour_transfers" ADD CONSTRAINT "labour_transfers_labour_id_fkey" FOREIGN KEY ("labour_id") REFERENCES "construction_labour"."labours"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "construction_labour"."labour_attendance" ADD CONSTRAINT "labour_attendance_labour_id_fkey" FOREIGN KEY ("labour_id") REFERENCES "construction_labour"."labours"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "construction_labour"."labour_overtime" ADD CONSTRAINT "labour_overtime_attendance_id_fkey" FOREIGN KEY ("attendance_id") REFERENCES "construction_labour"."labour_attendance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "construction_labour"."vendor_projects" ADD CONSTRAINT "vendor_projects_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "construction_labour"."vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "construction_labour"."vendor_shifts" ADD CONSTRAINT "vendor_shifts_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "construction_labour"."vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "construction_labour"."vendor_rates" ADD CONSTRAINT "vendor_rates_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "construction_labour"."vendor_shifts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "construction_labour"."vendor_attendance" ADD CONSTRAINT "vendor_attendance_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "construction_labour"."vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "construction_labour"."vendor_attendance_lines" ADD CONSTRAINT "vendor_attendance_lines_attendance_id_fkey" FOREIGN KEY ("attendance_id") REFERENCES "construction_labour"."vendor_attendance"("id") ON DELETE CASCADE ON UPDATE CASCADE;



-- One live row per name per Company, per list; one live Project per name;
-- one live Labour Id per Company (written by hand: Prisma cannot express a
-- partial index).
CREATE UNIQUE INDEX "labour_categories_live_name_key" ON "construction_masters"."labour_categories"("workspace_id", lower("name")) WHERE "deleted_at" IS NULL;
CREATE UNIQUE INDEX "departments_live_name_key" ON "construction_masters"."departments"("workspace_id", lower("name")) WHERE "deleted_at" IS NULL;
CREATE UNIQUE INDEX "supervisors_live_name_key" ON "construction_masters"."supervisors"("workspace_id", lower("name")) WHERE "deleted_at" IS NULL;
CREATE UNIQUE INDEX "projects_live_name_key" ON "construction_projects"."projects"("workspace_id", lower("name")) WHERE "deleted_at" IS NULL;
CREATE UNIQUE INDEX "labours_live_code_key" ON "construction_labour"."labours"("workspace_id", lower("labour_code")) WHERE "deleted_at" IS NULL AND "labour_code" IS NOT NULL;

-- One live attendance row per labourer per day, and per vendor per Project
-- per day (CM-210, CM-212).
CREATE UNIQUE INDEX "labour_attendance_live_day_key" ON "construction_labour"."labour_attendance"("labour_id", "attendance_date") WHERE "deleted_at" IS NULL;
CREATE UNIQUE INDEX "vendor_attendance_live_day_key" ON "construction_labour"."vendor_attendance"("vendor_id", "project_id", "attendance_date") WHERE "deleted_at" IS NULL;

-- Money is never negative where it is a rate or a payment; ledger amounts
-- are signed (ADR CM-0004).
ALTER TABLE "construction_labour"."labours" ADD CONSTRAINT "labours_wages_check" CHECK (
  "overtime_wage_per_hour" >= 0
  AND ("wage_type" <> 'daily' OR ("wage_per_day" IS NOT NULL AND "wage_per_day" >= 0))
  AND ("wage_type" <> 'monthly' OR ("wage_per_month" IS NOT NULL AND "wage_per_month" >= 0))
);
ALTER TABLE "construction_labour"."labour_overtime" ADD CONSTRAINT "labour_overtime_hours_check" CHECK ("hours" > 0 AND "hours" <= 24 AND "rate_per_hour" >= 0);
ALTER TABLE "construction_labour"."vendor_attendance_lines" ADD CONSTRAINT "vendor_attendance_lines_counts_check" CHECK ("full_day_count" >= 0 AND "half_day_count" >= 0 AND "overtime_hours" >= 0);
ALTER TABLE "construction_labour"."wage_payments" ADD CONSTRAINT "wage_payments_amount_check" CHECK ("amount" > 0);

-- Companies created before M2 get the seed lists new Companies receive
-- (CM-203; keep in step with src/masters/infrastructure/seeds/masters.json).
INSERT INTO "construction_masters"."labour_categories" ("id", "workspace_id", "name", "is_seed", "created_by", "updated_by")
SELECT gen_random_uuid(), p."workspace_id", s."name", true, 'system', 'system'
FROM "construction_organization"."company_profiles" p
CROSS JOIN (VALUES
  ('Carpenter'),
  ('Electrician'),
  ('Helper'),
  ('Labour'),
  ('Mason'),
  ('Plumber'),
  ('Skilled'),
  ('Unskilled'),
  ('Welder')
) AS s("name")
WHERE p."deleted_at" IS NULL;

INSERT INTO "construction_masters"."departments" ("id", "workspace_id", "name", "is_seed", "created_by", "updated_by")
SELECT gen_random_uuid(), p."workspace_id", s."name", true, 'system', 'system'
FROM "construction_organization"."company_profiles" p
CROSS JOIN (VALUES
  ('Surveying'),
  ('Departmental Work'),
  ('Equipment'),
  ('Tancha Work'),
  ('Steel Reinforcement Work'),
  ('Flooring Work'),
  ('False Ceiling'),
  ('Pollution Control'),
  ('Landscaping'),
  ('Planning'),
  ('Marketing'),
  ('Purchase'),
  ('Account'),
  ('HVAC'),
  ('Solar Electric'),
  ('Solar Water Heater'),
  ('Corporation Water'),
  ('Water'),
  ('Drainage'),
  ('Soil Backfilling'),
  ('Excavation'),
  ('Labour'),
  ('Miscellaneous Labour'),
  ('Elevation'),
  ('Concrete Hacking'),
  ('Glazing'),
  ('Silicone'),
  ('Stone Fixing'),
  ('Soil Nail & Gunting'),
  ('Anti Termite'),
  ('Soil Filling'),
  ('Diaphragm Wall'),
  ('Piling Work'),
  ('Safety'),
  ('Shuttering'),
  ('Glass Fixing'),
  ('Aluminum Section'),
  ('POP'),
  ('Trimix Work'),
  ('Exposed Work'),
  ('Fire Safety'),
  ('Fabrication'),
  ('Carpentry'),
  ('Cleaning'),
  ('Acid Wash'),
  ('Painting'),
  ('Tiling Work'),
  ('Plumbing'),
  ('Electric'),
  ('Chicken mesh'),
  ('Water Proofing'),
  ('Masonry & Plaster'),
  ('RCC')
) AS s("name")
WHERE p."deleted_at" IS NULL;
