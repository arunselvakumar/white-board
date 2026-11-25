-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "preschool";

-- CreateEnum
CREATE TYPE "preschool"."centre_ownership" AS ENUM ('company_owned', 'franchised');

-- CreateEnum
CREATE TYPE "preschool"."centre_status" AS ENUM ('active', 'closed');

-- CreateEnum
CREATE TYPE "preschool"."staff_role" AS ENUM ('centre_head', 'teacher', 'helper');

-- CreateEnum
CREATE TYPE "preschool"."staff_status" AS ENUM ('active', 'inactive');

-- CreateEnum
CREATE TYPE "preschool"."gender" AS ENUM ('girl', 'boy', 'other');

-- CreateEnum
CREATE TYPE "preschool"."enquiry_status" AS ENUM ('new', 'contacted', 'visit_scheduled', 'visited', 'admitted', 'lost');

-- CreateEnum
CREATE TYPE "preschool"."enquiry_source" AS ENUM ('walk_in', 'referral', 'google', 'social_media', 'flyer', 'head_office', 'other');

-- CreateEnum
CREATE TYPE "preschool"."enquiry_activity_kind" AS ENUM ('note', 'call', 'visit', 'status_change');

-- CreateEnum
CREATE TYPE "preschool"."child_status" AS ENUM ('active', 'withdrawn', 'graduated');

-- CreateEnum
CREATE TYPE "preschool"."admission_status" AS ENUM ('active', 'ended');

-- CreateEnum
CREATE TYPE "preschool"."admission_end_reason" AS ENUM ('promoted', 'withdrawn', 'classroom_changed', 'graduated');

-- CreateEnum
CREATE TYPE "preschool"."attendance_status" AS ENUM ('present', 'absent', 'leave');

-- CreateEnum
CREATE TYPE "preschool"."collected_by_kind" AS ENUM ('father', 'mother', 'authorised_pickup', 'other');

-- CreateEnum
CREATE TYPE "preschool"."daily_report_status" AS ENUM ('draft', 'published');

-- CreateEnum
CREATE TYPE "preschool"."mood" AS ENUM ('happy', 'calm', 'tired', 'fussy', 'unwell');

-- CreateEnum
CREATE TYPE "preschool"."fee_head_kind" AS ENUM ('one_time', 'recurring');

-- CreateEnum
CREATE TYPE "preschool"."fee_frequency" AS ENUM ('one_time', 'monthly', 'quarterly', 'term', 'annual');

-- CreateEnum
CREATE TYPE "preschool"."fee_payment_method" AS ENUM ('cash', 'upi', 'card', 'cheque', 'bank_transfer');

-- CreateEnum
CREATE TYPE "preschool"."announcement_kind" AS ENUM ('notice', 'event', 'holiday');

-- CreateEnum
CREATE TYPE "preschool"."term" AS ENUM ('term_1', 'term_2', 'term_3');

-- CreateEnum
CREATE TYPE "preschool"."progress_rating" AS ENUM ('beginning', 'progressing', 'proficient');

-- CreateEnum
CREATE TYPE "preschool"."progress_report_status" AS ENUM ('draft', 'published');

-- CreateEnum
CREATE TYPE "preschool"."stock_item_kind" AS ENUM ('consumable', 'asset');

-- CreateEnum
CREATE TYPE "preschool"."stock_category" AS ENUM ('books', 'notebooks', 'stationery', 'uniform', 'kit', 'toys_learning_aids', 'housekeeping', 'furniture_equipment', 'other');

-- CreateEnum
CREATE TYPE "preschool"."stock_movement_kind" AS ENUM ('received', 'issued_to_child', 'issued_to_classroom', 'issued_to_staff', 'transfer_out', 'transfer_in', 'adjusted');

-- CreateTable
CREATE TABLE "preschool"."settings" (
    "workspace_id" TEXT NOT NULL,
    "academic_year_start_month" SMALLINT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("workspace_id")
);

-- CreateTable
CREATE TABLE "preschool"."centres" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "code" VARCHAR(6) NOT NULL,
    "ownership" "preschool"."centre_ownership" NOT NULL DEFAULT 'company_owned',
    "status" "preschool"."centre_status" NOT NULL DEFAULT 'active',
    "phone" VARCHAR(32),
    "email" VARCHAR(320),
    "address_line" VARCHAR(300),
    "city" VARCHAR(100),
    "state" VARCHAR(100),
    "pincode" VARCHAR(10),
    "franchisee_name" VARCHAR(200),
    "franchisee_phone" VARCHAR(32),
    "franchisee_email" VARCHAR(320),
    "agreement_start_on" DATE,
    "agreement_end_on" DATE,
    "royalty_bps" INTEGER NOT NULL DEFAULT 0,
    "may_override_fees" BOOLEAN NOT NULL DEFAULT true,
    "next_admission_seq" INTEGER NOT NULL DEFAULT 1,
    "next_receipt_seq" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "centres_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "preschool"."academic_years" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "name" VARCHAR(20) NOT NULL,
    "starts_on" DATE NOT NULL,
    "ends_on" DATE NOT NULL,
    "is_current" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "academic_years_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "preschool"."programmes" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "min_age_months" INTEGER,
    "max_age_months" INTEGER,
    "is_daycare" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "programmes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "preschool"."classrooms" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "centre_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "programme_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "capacity" INTEGER NOT NULL,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "classrooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "preschool"."staff" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "centre_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "role" "preschool"."staff_role" NOT NULL,
    "status" "preschool"."staff_status" NOT NULL DEFAULT 'active',
    "phone" VARCHAR(32),
    "email" VARCHAR(320),
    "designation" VARCHAR(100),
    "joined_on" DATE,
    "invited_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "staff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "preschool"."classroom_teachers" (
    "classroom_id" UUID NOT NULL,
    "staff_id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "classroom_teachers_pkey" PRIMARY KEY ("classroom_id","staff_id")
);

-- CreateTable
CREATE TABLE "preschool"."enquiries" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "centre_id" UUID NOT NULL,
    "created_by_user_id" TEXT NOT NULL,
    "child_name" VARCHAR(200) NOT NULL,
    "child_date_of_birth" DATE,
    "child_gender" "preschool"."gender",
    "parent_name" VARCHAR(200) NOT NULL,
    "parent_phone" VARCHAR(32) NOT NULL,
    "parent_email" VARCHAR(320),
    "programme_id" UUID,
    "source" "preschool"."enquiry_source" NOT NULL DEFAULT 'walk_in',
    "status" "preschool"."enquiry_status" NOT NULL DEFAULT 'new',
    "visit_on" DATE,
    "next_follow_up_on" DATE,
    "lost_reason" VARCHAR(200),
    "notes" TEXT,
    "converted_child_id" UUID,
    "converted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "enquiries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "preschool"."enquiry_activities" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "enquiry_id" UUID NOT NULL,
    "kind" "preschool"."enquiry_activity_kind" NOT NULL,
    "note" TEXT,
    "to_status" "preschool"."enquiry_status",
    "created_by_user_id" TEXT NOT NULL,
    "created_by_name" VARCHAR(200) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "enquiry_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "preschool"."children" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "centre_id" UUID NOT NULL,
    "admission_number" VARCHAR(32) NOT NULL,
    "first_name" VARCHAR(100) NOT NULL,
    "last_name" VARCHAR(100),
    "date_of_birth" DATE NOT NULL,
    "gender" "preschool"."gender" NOT NULL,
    "blood_group" VARCHAR(8),
    "photo_url" VARCHAR(2048),
    "mother_tongue" VARCHAR(60),
    "address_line" VARCHAR(300),
    "city" VARCHAR(100),
    "state" VARCHAR(100),
    "pincode" VARCHAR(10),
    "father_name" VARCHAR(200),
    "father_phone" VARCHAR(32),
    "father_email" VARCHAR(320),
    "father_occupation" VARCHAR(100),
    "mother_name" VARCHAR(200),
    "mother_phone" VARCHAR(32),
    "mother_email" VARCHAR(320),
    "mother_occupation" VARCHAR(100),
    "emergency_contact_name" VARCHAR(200),
    "emergency_contact_phone" VARCHAR(32),
    "emergency_contact_relationship" VARCHAR(60),
    "allergies" TEXT,
    "medical_conditions" TEXT,
    "doctor_name" VARCHAR(200),
    "doctor_phone" VARCHAR(32),
    "immunisation_up_to_date" BOOLEAN,
    "has_birth_certificate" BOOLEAN NOT NULL DEFAULT false,
    "has_aadhaar" BOOLEAN NOT NULL DEFAULT false,
    "has_immunisation_card" BOOLEAN NOT NULL DEFAULT false,
    "has_photos" BOOLEAN NOT NULL DEFAULT false,
    "has_address_proof" BOOLEAN NOT NULL DEFAULT false,
    "status" "preschool"."child_status" NOT NULL DEFAULT 'active',
    "withdrawn_on" DATE,
    "withdraw_reason" VARCHAR(300),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "children_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "preschool"."authorised_pickups" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "child_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "relationship" VARCHAR(60) NOT NULL,
    "phone" VARCHAR(32) NOT NULL,
    "photo_url" VARCHAR(2048),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "authorised_pickups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "preschool"."admissions" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "centre_id" UUID NOT NULL,
    "child_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "programme_id" UUID NOT NULL,
    "classroom_id" UUID NOT NULL,
    "admitted_on" DATE NOT NULL,
    "status" "preschool"."admission_status" NOT NULL DEFAULT 'active',
    "ended_on" DATE,
    "end_reason" "preschool"."admission_end_reason",
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "preschool"."attendance" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "centre_id" UUID NOT NULL,
    "classroom_id" UUID NOT NULL,
    "child_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "status" "preschool"."attendance_status" NOT NULL,
    "check_in_at" TIMESTAMP(3),
    "dropped_by" VARCHAR(200),
    "check_out_at" TIMESTAMP(3),
    "collected_by_kind" "preschool"."collected_by_kind",
    "collected_by_name" VARCHAR(200),
    "collected_by_pickup_id" UUID,
    "note" VARCHAR(500),
    "marked_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "preschool"."daily_reports" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "centre_id" UUID NOT NULL,
    "classroom_id" UUID NOT NULL,
    "child_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "status" "preschool"."daily_report_status" NOT NULL DEFAULT 'draft',
    "meals" JSONB NOT NULL DEFAULT '[]',
    "nap_from" VARCHAR(5),
    "nap_to" VARCHAR(5),
    "toilet" JSONB NOT NULL DEFAULT '[]',
    "mood" "preschool"."mood",
    "activities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "note" TEXT,
    "photos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "published_at" TIMESTAMP(3),
    "published_by_user_id" TEXT,
    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "preschool"."fee_heads" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "kind" "preschool"."fee_head_kind" NOT NULL,
    "royalty_bearing" BOOLEAN NOT NULL DEFAULT false,
    "refundable" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fee_heads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "preschool"."fee_structures" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "centre_id" UUID,
    "academic_year_id" UUID NOT NULL,
    "programme_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fee_structures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "preschool"."fee_structure_items" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "fee_structure_id" UUID NOT NULL,
    "fee_head_id" UUID NOT NULL,
    "amount_paise" INTEGER NOT NULL,
    "frequency" "preschool"."fee_frequency" NOT NULL,

    CONSTRAINT "fee_structure_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "preschool"."invoices" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "centre_id" UUID NOT NULL,
    "child_id" UUID NOT NULL,
    "admission_id" UUID NOT NULL,
    "fee_head_id" UUID NOT NULL,
    "label" VARCHAR(200) NOT NULL,
    "due_on" DATE NOT NULL,
    "amount_paise" INTEGER NOT NULL,
    "concession_paise" INTEGER NOT NULL DEFAULT 0,
    "concession_reason" VARCHAR(200),
    "paid_paise" INTEGER NOT NULL DEFAULT 0,
    "cancelled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "preschool"."fee_payments" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "centre_id" UUID NOT NULL,
    "child_id" UUID NOT NULL,
    "receipt_number" VARCHAR(40) NOT NULL,
    "received_on" DATE NOT NULL,
    "amount_paise" INTEGER NOT NULL,
    "method" "preschool"."fee_payment_method" NOT NULL,
    "reference" VARCHAR(100),
    "note" VARCHAR(300),
    "recorded_by_user_id" TEXT NOT NULL,
    "recorded_by_name" VARCHAR(200) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fee_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "preschool"."fee_payment_allocations" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "payment_id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "amount_paise" INTEGER NOT NULL,

    CONSTRAINT "fee_payment_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "preschool"."announcements" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "centre_id" UUID,
    "classroom_id" UUID,
    "kind" "preschool"."announcement_kind" NOT NULL DEFAULT 'notice',
    "title" VARCHAR(200) NOT NULL,
    "body" TEXT NOT NULL,
    "starts_on" DATE,
    "ends_on" DATE,
    "published_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_user_id" TEXT NOT NULL,
    "created_by_name" VARCHAR(200) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "announcements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "preschool"."development_domains" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" VARCHAR(500),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "development_domains_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "preschool"."observations" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "centre_id" UUID NOT NULL,
    "child_id" UUID NOT NULL,
    "domain_id" UUID NOT NULL,
    "observed_on" DATE NOT NULL,
    "note" TEXT NOT NULL,
    "created_by_user_id" TEXT NOT NULL,
    "created_by_name" VARCHAR(200) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "observations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "preschool"."progress_reports" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "centre_id" UUID NOT NULL,
    "child_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "term" "preschool"."term" NOT NULL,
    "status" "preschool"."progress_report_status" NOT NULL DEFAULT 'draft',
    "teacher_remarks" TEXT,
    "published_at" TIMESTAMP(3),
    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "progress_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "preschool"."progress_report_ratings" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "report_id" UUID NOT NULL,
    "domain_id" UUID NOT NULL,
    "rating" "preschool"."progress_rating" NOT NULL,
    "remark" VARCHAR(500),

    CONSTRAINT "progress_report_ratings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "preschool"."stock_items" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "category" "preschool"."stock_category" NOT NULL,
    "kind" "preschool"."stock_item_kind" NOT NULL DEFAULT 'consumable',
    "unit" VARCHAR(20) NOT NULL,
    "reorder_level" INTEGER,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "preschool"."stock_movements" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "centre_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "kind" "preschool"."stock_movement_kind" NOT NULL,
    "quantity_delta" INTEGER NOT NULL,
    "moved_on" DATE NOT NULL,
    "supplier_name" VARCHAR(200),
    "bill_number" VARCHAR(60),
    "unit_cost_paise" INTEGER,
    "child_id" UUID,
    "classroom_id" UUID,
    "staff_id" UUID,
    "transfer_id" UUID,
    "other_centre_id" UUID,
    "note" VARCHAR(300),
    "recorded_by_user_id" TEXT NOT NULL,
    "recorded_by_name" VARCHAR(200) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "centres_workspace_id_deleted_at_name_idx" ON "preschool"."centres"("workspace_id", "deleted_at", "name");

-- CreateIndex
CREATE UNIQUE INDEX "centres_workspace_id_code_key" ON "preschool"."centres"("workspace_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "academic_years_workspace_id_starts_on_key" ON "preschool"."academic_years"("workspace_id", "starts_on");

-- CreateIndex
CREATE INDEX "programmes_workspace_id_archived_at_sort_order_idx" ON "preschool"."programmes"("workspace_id", "archived_at", "sort_order");

-- CreateIndex
CREATE INDEX "classrooms_workspace_id_centre_id_academic_year_id_deleted__idx" ON "preschool"."classrooms"("workspace_id", "centre_id", "academic_year_id", "deleted_at");

-- CreateIndex
CREATE INDEX "staff_workspace_id_email_deleted_at_idx" ON "preschool"."staff"("workspace_id", "email", "deleted_at");

-- CreateIndex
CREATE INDEX "staff_workspace_id_centre_id_deleted_at_idx" ON "preschool"."staff"("workspace_id", "centre_id", "deleted_at");

-- CreateIndex
CREATE INDEX "classroom_teachers_staff_id_idx" ON "preschool"."classroom_teachers"("staff_id");

-- CreateIndex
CREATE UNIQUE INDEX "enquiries_converted_child_id_key" ON "preschool"."enquiries"("converted_child_id");

-- CreateIndex
CREATE INDEX "enquiries_workspace_id_centre_id_deleted_at_status_created__idx" ON "preschool"."enquiries"("workspace_id", "centre_id", "deleted_at", "status", "created_at");

-- CreateIndex
CREATE INDEX "enquiries_workspace_id_centre_id_deleted_at_next_follow_up__idx" ON "preschool"."enquiries"("workspace_id", "centre_id", "deleted_at", "next_follow_up_on");

-- CreateIndex
CREATE INDEX "enquiry_activities_enquiry_id_created_at_idx" ON "preschool"."enquiry_activities"("enquiry_id", "created_at");

-- CreateIndex
CREATE INDEX "children_workspace_id_centre_id_deleted_at_status_first_nam_idx" ON "preschool"."children"("workspace_id", "centre_id", "deleted_at", "status", "first_name");

-- CreateIndex
CREATE INDEX "children_workspace_id_father_email_idx" ON "preschool"."children"("workspace_id", "father_email");

-- CreateIndex
CREATE INDEX "children_workspace_id_mother_email_idx" ON "preschool"."children"("workspace_id", "mother_email");

-- CreateIndex
CREATE UNIQUE INDEX "children_workspace_id_admission_number_key" ON "preschool"."children"("workspace_id", "admission_number");

-- CreateIndex
CREATE INDEX "authorised_pickups_child_id_idx" ON "preschool"."authorised_pickups"("child_id");

-- CreateIndex
CREATE INDEX "admissions_workspace_id_centre_id_status_classroom_id_idx" ON "preschool"."admissions"("workspace_id", "centre_id", "status", "classroom_id");

-- CreateIndex
CREATE INDEX "admissions_child_id_status_idx" ON "preschool"."admissions"("child_id", "status");

-- CreateIndex
CREATE INDEX "attendance_workspace_id_centre_id_date_classroom_id_idx" ON "preschool"."attendance"("workspace_id", "centre_id", "date", "classroom_id");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_child_id_date_key" ON "preschool"."attendance"("child_id", "date");

-- CreateIndex
CREATE INDEX "daily_reports_workspace_id_centre_id_date_classroom_id_idx" ON "preschool"."daily_reports"("workspace_id", "centre_id", "date", "classroom_id");

-- CreateIndex
CREATE UNIQUE INDEX "daily_reports_child_id_date_key" ON "preschool"."daily_reports"("child_id", "date");

-- CreateIndex
CREATE INDEX "fee_heads_workspace_id_archived_at_sort_order_idx" ON "preschool"."fee_heads"("workspace_id", "archived_at", "sort_order");

-- CreateIndex
CREATE INDEX "fee_structures_workspace_id_academic_year_id_programme_id_c_idx" ON "preschool"."fee_structures"("workspace_id", "academic_year_id", "programme_id", "centre_id");

-- CreateIndex
CREATE UNIQUE INDEX "fee_structure_items_fee_structure_id_fee_head_id_key" ON "preschool"."fee_structure_items"("fee_structure_id", "fee_head_id");

-- CreateIndex
CREATE INDEX "invoices_workspace_id_centre_id_cancelled_at_due_on_idx" ON "preschool"."invoices"("workspace_id", "centre_id", "cancelled_at", "due_on");

-- CreateIndex
CREATE INDEX "invoices_child_id_cancelled_at_due_on_idx" ON "preschool"."invoices"("child_id", "cancelled_at", "due_on");

-- CreateIndex
CREATE INDEX "fee_payments_workspace_id_centre_id_received_on_idx" ON "preschool"."fee_payments"("workspace_id", "centre_id", "received_on");

-- CreateIndex
CREATE INDEX "fee_payments_child_id_received_on_idx" ON "preschool"."fee_payments"("child_id", "received_on");

-- CreateIndex
CREATE UNIQUE INDEX "fee_payments_workspace_id_receipt_number_key" ON "preschool"."fee_payments"("workspace_id", "receipt_number");

-- CreateIndex
CREATE INDEX "fee_payment_allocations_payment_id_idx" ON "preschool"."fee_payment_allocations"("payment_id");

-- CreateIndex
CREATE INDEX "fee_payment_allocations_invoice_id_idx" ON "preschool"."fee_payment_allocations"("invoice_id");

-- CreateIndex
CREATE INDEX "announcements_workspace_id_deleted_at_published_at_idx" ON "preschool"."announcements"("workspace_id", "deleted_at", "published_at");

-- CreateIndex
CREATE INDEX "announcements_workspace_id_centre_id_deleted_at_published_a_idx" ON "preschool"."announcements"("workspace_id", "centre_id", "deleted_at", "published_at");

-- CreateIndex
CREATE INDEX "development_domains_workspace_id_archived_at_sort_order_idx" ON "preschool"."development_domains"("workspace_id", "archived_at", "sort_order");

-- CreateIndex
CREATE INDEX "observations_child_id_deleted_at_observed_on_idx" ON "preschool"."observations"("child_id", "deleted_at", "observed_on");

-- CreateIndex
CREATE INDEX "progress_reports_workspace_id_centre_id_academic_year_id_te_idx" ON "preschool"."progress_reports"("workspace_id", "centre_id", "academic_year_id", "term");

-- CreateIndex
CREATE UNIQUE INDEX "progress_reports_child_id_academic_year_id_term_key" ON "preschool"."progress_reports"("child_id", "academic_year_id", "term");

-- CreateIndex
CREATE UNIQUE INDEX "progress_report_ratings_report_id_domain_id_key" ON "preschool"."progress_report_ratings"("report_id", "domain_id");

-- CreateIndex
CREATE INDEX "stock_items_workspace_id_archived_at_category_name_idx" ON "preschool"."stock_items"("workspace_id", "archived_at", "category", "name");

-- CreateIndex
CREATE INDEX "stock_movements_workspace_id_centre_id_item_id_moved_on_idx" ON "preschool"."stock_movements"("workspace_id", "centre_id", "item_id", "moved_on");

-- CreateIndex
CREATE INDEX "stock_movements_child_id_idx" ON "preschool"."stock_movements"("child_id");

-- AddForeignKey
ALTER TABLE "preschool"."classrooms" ADD CONSTRAINT "classrooms_centre_id_fkey" FOREIGN KEY ("centre_id") REFERENCES "preschool"."centres"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preschool"."classrooms" ADD CONSTRAINT "classrooms_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "preschool"."academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preschool"."classrooms" ADD CONSTRAINT "classrooms_programme_id_fkey" FOREIGN KEY ("programme_id") REFERENCES "preschool"."programmes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preschool"."staff" ADD CONSTRAINT "staff_centre_id_fkey" FOREIGN KEY ("centre_id") REFERENCES "preschool"."centres"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preschool"."classroom_teachers" ADD CONSTRAINT "classroom_teachers_classroom_id_fkey" FOREIGN KEY ("classroom_id") REFERENCES "preschool"."classrooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preschool"."classroom_teachers" ADD CONSTRAINT "classroom_teachers_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "preschool"."staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preschool"."enquiries" ADD CONSTRAINT "enquiries_centre_id_fkey" FOREIGN KEY ("centre_id") REFERENCES "preschool"."centres"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preschool"."enquiries" ADD CONSTRAINT "enquiries_programme_id_fkey" FOREIGN KEY ("programme_id") REFERENCES "preschool"."programmes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preschool"."enquiry_activities" ADD CONSTRAINT "enquiry_activities_enquiry_id_fkey" FOREIGN KEY ("enquiry_id") REFERENCES "preschool"."enquiries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preschool"."children" ADD CONSTRAINT "children_centre_id_fkey" FOREIGN KEY ("centre_id") REFERENCES "preschool"."centres"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preschool"."authorised_pickups" ADD CONSTRAINT "authorised_pickups_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "preschool"."children"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preschool"."admissions" ADD CONSTRAINT "admissions_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "preschool"."children"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preschool"."admissions" ADD CONSTRAINT "admissions_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "preschool"."academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preschool"."admissions" ADD CONSTRAINT "admissions_programme_id_fkey" FOREIGN KEY ("programme_id") REFERENCES "preschool"."programmes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preschool"."admissions" ADD CONSTRAINT "admissions_classroom_id_fkey" FOREIGN KEY ("classroom_id") REFERENCES "preschool"."classrooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preschool"."attendance" ADD CONSTRAINT "attendance_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "preschool"."children"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preschool"."daily_reports" ADD CONSTRAINT "daily_reports_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "preschool"."children"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preschool"."fee_structures" ADD CONSTRAINT "fee_structures_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "preschool"."academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preschool"."fee_structures" ADD CONSTRAINT "fee_structures_programme_id_fkey" FOREIGN KEY ("programme_id") REFERENCES "preschool"."programmes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preschool"."fee_structure_items" ADD CONSTRAINT "fee_structure_items_fee_structure_id_fkey" FOREIGN KEY ("fee_structure_id") REFERENCES "preschool"."fee_structures"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preschool"."fee_structure_items" ADD CONSTRAINT "fee_structure_items_fee_head_id_fkey" FOREIGN KEY ("fee_head_id") REFERENCES "preschool"."fee_heads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preschool"."invoices" ADD CONSTRAINT "invoices_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "preschool"."children"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preschool"."invoices" ADD CONSTRAINT "invoices_admission_id_fkey" FOREIGN KEY ("admission_id") REFERENCES "preschool"."admissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preschool"."invoices" ADD CONSTRAINT "invoices_fee_head_id_fkey" FOREIGN KEY ("fee_head_id") REFERENCES "preschool"."fee_heads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preschool"."fee_payments" ADD CONSTRAINT "fee_payments_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "preschool"."children"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preschool"."fee_payment_allocations" ADD CONSTRAINT "fee_payment_allocations_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "preschool"."fee_payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preschool"."fee_payment_allocations" ADD CONSTRAINT "fee_payment_allocations_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "preschool"."invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preschool"."observations" ADD CONSTRAINT "observations_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "preschool"."children"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preschool"."observations" ADD CONSTRAINT "observations_domain_id_fkey" FOREIGN KEY ("domain_id") REFERENCES "preschool"."development_domains"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preschool"."progress_reports" ADD CONSTRAINT "progress_reports_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "preschool"."children"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preschool"."progress_report_ratings" ADD CONSTRAINT "progress_report_ratings_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "preschool"."progress_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preschool"."progress_report_ratings" ADD CONSTRAINT "progress_report_ratings_domain_id_fkey" FOREIGN KEY ("domain_id") REFERENCES "preschool"."development_domains"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preschool"."stock_movements" ADD CONSTRAINT "stock_movements_centre_id_fkey" FOREIGN KEY ("centre_id") REFERENCES "preschool"."centres"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preschool"."stock_movements" ADD CONSTRAINT "stock_movements_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "preschool"."stock_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preschool"."stock_movements" ADD CONSTRAINT "stock_movements_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "preschool"."children"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
