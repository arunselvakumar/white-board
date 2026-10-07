-- Enquiries, follow-up history, demo classes, and Enquiry Sources (WB-013, ADR-0032).
-- Written by hand from Prisma's diff; only adds objects in training_institute.
-- CreateEnum
CREATE TYPE "training_institute"."enquiry_stage" AS ENUM ('new', 'follow_up', 'demo_scheduled', 'demo_attended', 'joined', 'not_interested');

-- CreateEnum
CREATE TYPE "training_institute"."enquiry_activity_kind" AS ENUM ('created', 'follow_up', 'not_interested', 'reopened', 'joined', 'details_updated');

-- CreateEnum
CREATE TYPE "training_institute"."demo_kind" AS ENUM ('batch', 'one_to_one');

-- CreateEnum
CREATE TYPE "training_institute"."demo_fee_kind" AS ENUM ('free', 'paid');

-- CreateEnum
CREATE TYPE "training_institute"."demo_attendance" AS ENUM ('unmarked', 'attended', 'missed');

-- CreateTable
CREATE TABLE "training_institute"."enquiry_sources" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "retired_at" TIMESTAMP(3),
    "retired_by_user_id" TEXT,
    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "enquiry_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_institute"."enquiries" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "created_by_user_id" TEXT NOT NULL,
    "prospect_name" VARCHAR(200) NOT NULL,
    "phone" VARCHAR(32) NOT NULL,
    "email" VARCHAR(320),
    "guardian_name" VARCHAR(200),
    "guardian_phone" VARCHAR(32),
    "course_id" UUID,
    "subject" VARCHAR(200),
    "preferred_class_mode" "training_institute"."class_mode",
    "preferred_timing" VARCHAR(200),
    "source_id" UUID,
    "notes" TEXT,
    "stage" "training_institute"."enquiry_stage" NOT NULL DEFAULT 'new',
    "next_follow_up_on" DATE,
    "not_interested_reason" VARCHAR(200),
    "closed_at" TIMESTAMP(3),
    "closed_by_user_id" TEXT,
    "converted_student_id" UUID,
    "converted_enrollment_id" UUID,
    "converted_at" TIMESTAMP(3),
    "converted_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by_user_id" TEXT,

    CONSTRAINT "enquiries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_institute"."enquiry_activities" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "enquiry_id" UUID NOT NULL,
    "kind" "training_institute"."enquiry_activity_kind" NOT NULL,
    "note" VARCHAR(1000),
    "next_follow_up_on" DATE,
    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "enquiry_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_institute"."enquiry_demos" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "enquiry_id" UUID NOT NULL,
    "kind" "training_institute"."demo_kind" NOT NULL,
    "batch_id" UUID,
    "teacher_id" UUID,
    "demo_date" DATE NOT NULL,
    "start_time" VARCHAR(5) NOT NULL,
    "end_time" VARCHAR(5) NOT NULL,
    "timezone" VARCHAR(64) NOT NULL,
    "fee_kind" "training_institute"."demo_fee_kind" NOT NULL,
    "fee_amount_paise" INTEGER,
    "fee_paid_at" TIMESTAMP(3),
    "fee_paid_by_user_id" TEXT,
    "attendance" "training_institute"."demo_attendance" NOT NULL DEFAULT 'unmarked',
    "attendance_marked_at" TIMESTAMP(3),
    "attendance_marked_by_user_id" TEXT,
    "cancelled_at" TIMESTAMP(3),
    "cancelled_by_user_id" TEXT,
    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "enquiry_demos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "enquiry_sources_workspace_id_retired_at_idx" ON "training_institute"."enquiry_sources"("workspace_id", "retired_at");

-- CreateIndex
CREATE UNIQUE INDEX "enquiries_converted_student_id_key" ON "training_institute"."enquiries"("converted_student_id");

-- CreateIndex
CREATE INDEX "enquiries_workspace_id_deleted_at_created_at_id_idx" ON "training_institute"."enquiries"("workspace_id", "deleted_at", "created_at", "id");

-- CreateIndex
CREATE INDEX "enquiries_workspace_id_stage_next_follow_up_on_idx" ON "training_institute"."enquiries"("workspace_id", "stage", "next_follow_up_on");

-- CreateIndex
CREATE INDEX "enquiries_workspace_id_phone_idx" ON "training_institute"."enquiries"("workspace_id", "phone");

-- CreateIndex
CREATE INDEX "enquiry_activities_enquiry_id_created_at_idx" ON "training_institute"."enquiry_activities"("enquiry_id", "created_at");

-- CreateIndex
CREATE INDEX "enquiry_demos_workspace_id_demo_date_idx" ON "training_institute"."enquiry_demos"("workspace_id", "demo_date");

-- CreateIndex
CREATE INDEX "enquiry_demos_workspace_id_teacher_id_demo_date_idx" ON "training_institute"."enquiry_demos"("workspace_id", "teacher_id", "demo_date");

-- CreateIndex
CREATE INDEX "enquiry_demos_enquiry_id_idx" ON "training_institute"."enquiry_demos"("enquiry_id");

-- AddForeignKey
ALTER TABLE "training_institute"."enquiries" ADD CONSTRAINT "enquiries_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "training_institute"."courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_institute"."enquiries" ADD CONSTRAINT "enquiries_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "training_institute"."enquiry_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_institute"."enquiries" ADD CONSTRAINT "enquiries_converted_student_id_fkey" FOREIGN KEY ("converted_student_id") REFERENCES "training_institute"."students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_institute"."enquiries" ADD CONSTRAINT "enquiries_converted_enrollment_id_fkey" FOREIGN KEY ("converted_enrollment_id") REFERENCES "training_institute"."enrollments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_institute"."enquiry_activities" ADD CONSTRAINT "enquiry_activities_enquiry_id_fkey" FOREIGN KEY ("enquiry_id") REFERENCES "training_institute"."enquiries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_institute"."enquiry_demos" ADD CONSTRAINT "enquiry_demos_enquiry_id_fkey" FOREIGN KEY ("enquiry_id") REFERENCES "training_institute"."enquiries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_institute"."enquiry_demos" ADD CONSTRAINT "enquiry_demos_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "training_institute"."batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_institute"."enquiry_demos" ADD CONSTRAINT "enquiry_demos_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "training_institute"."teachers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Source names are unique among a Workspace's active Sources, ignoring case.
CREATE UNIQUE INDEX "enquiry_sources_workspace_active_name_key"
ON "training_institute"."enquiry_sources" ("workspace_id", lower("name"))
WHERE "retired_at" IS NULL;

-- A Batch demo names a Batch; a one-to-one demo names a Teacher and no Batch.
ALTER TABLE "training_institute"."enquiry_demos" ADD CONSTRAINT "enquiry_demos_kind_check" CHECK (
  ("kind" = 'batch' AND "batch_id" IS NOT NULL AND "teacher_id" IS NULL)
  OR ("kind" = 'one_to_one' AND "teacher_id" IS NOT NULL AND "batch_id" IS NULL)
);

-- A paid demo has an amount from ₹1 to ₹1,00,000; a free demo has none.
ALTER TABLE "training_institute"."enquiry_demos" ADD CONSTRAINT "enquiry_demos_fee_check" CHECK (
  ("fee_kind" = 'free' AND "fee_amount_paise" IS NULL AND "fee_paid_at" IS NULL)
  OR ("fee_kind" = 'paid' AND "fee_amount_paise" IS NOT NULL
      AND "fee_amount_paise" BETWEEN 100 AND 10000000)
);
