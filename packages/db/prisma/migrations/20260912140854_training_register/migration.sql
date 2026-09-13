-- CreateEnum
CREATE TYPE "class_mode" AS ENUM ('offline', 'online', 'hybrid');

-- CreateEnum
CREATE TYPE "timing_source" AS ENUM ('batch', 'student');

-- CreateEnum
CREATE TYPE "fee_plan_type" AS ENUM ('one_time', 'monthly', 'installments');

-- CreateEnum
CREATE TYPE "fee_payment_method" AS ENUM ('cash', 'upi', 'card', 'other');

-- CreateTable
CREATE TABLE "courses" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "created_by_user_id" TEXT NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "duration" VARCHAR(80) NOT NULL,
    "description" TEXT,
    "default_fee_amount_paise" INTEGER NOT NULL,
    "archived_at" TIMESTAMP(3),
    "archived_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by_user_id" TEXT,

    CONSTRAINT "courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "batches" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "course_id" UUID NOT NULL,
    "created_by_user_id" TEXT NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "class_mode" "class_mode" NOT NULL,
    "capacity" INTEGER NOT NULL,
    "room" VARCHAR(80),
    "join_url" VARCHAR(2048),
    "timings" JSONB NOT NULL,
    "timezone" VARCHAR(64) NOT NULL DEFAULT 'Asia/Kolkata',
    "closed_at" TIMESTAMP(3),
    "closed_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by_user_id" TEXT,

    CONSTRAINT "batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "students" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "created_by_user_id" TEXT NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "phone" VARCHAR(32) NOT NULL,
    "email" VARCHAR(320),
    "photo_url" VARCHAR(2048),
    "address" TEXT,
    "id_proof_note" TEXT,
    "guardian_name" VARCHAR(200),
    "guardian_phone" VARCHAR(32),
    "dropped_at" TIMESTAMP(3),
    "dropped_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by_user_id" TEXT,

    CONSTRAINT "students_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enrollments" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "student_id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "created_by_user_id" TEXT NOT NULL,
    "class_mode_override" "class_mode",
    "timing_source" "timing_source" NOT NULL,
    "student_timings" JSONB,
    "ended_at" TIMESTAMP(3),
    "ended_by_user_id" TEXT,
    "fee_plan_type" "fee_plan_type" NOT NULL,
    "fee_plan_amount_paise" INTEGER NOT NULL,
    "fee_plan_installment_count" INTEGER,
    "fee_plan_concession_paise" INTEGER NOT NULL DEFAULT 0,
    "fee_plan_due_dates" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by_user_id" TEXT,

    CONSTRAINT "enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_payments" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "enrollment_id" UUID NOT NULL,
    "recorded_by_user_id" TEXT NOT NULL,
    "amount_paise" INTEGER NOT NULL,
    "method" "fee_payment_method" NOT NULL,
    "paid_at" TIMESTAMP(3) NOT NULL,
    "receipt_number" VARCHAR(32) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by_user_id" TEXT,

    CONSTRAINT "fee_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "courses_workspace_id_deleted_at_created_at_id_idx" ON "courses"("workspace_id", "deleted_at", "created_at", "id");

-- CreateIndex
CREATE INDEX "batches_workspace_id_deleted_at_created_at_id_idx" ON "batches"("workspace_id", "deleted_at", "created_at", "id");

-- CreateIndex
CREATE INDEX "batches_course_id_deleted_at_idx" ON "batches"("course_id", "deleted_at");

-- CreateIndex
CREATE INDEX "students_workspace_id_deleted_at_created_at_id_idx" ON "students"("workspace_id", "deleted_at", "created_at", "id");

-- CreateIndex
CREATE INDEX "students_workspace_id_phone_idx" ON "students"("workspace_id", "phone");

-- CreateIndex
CREATE INDEX "students_workspace_id_name_idx" ON "students"("workspace_id", "name");

-- CreateIndex
CREATE INDEX "enrollments_workspace_id_deleted_at_created_at_id_idx" ON "enrollments"("workspace_id", "deleted_at", "created_at", "id");

-- CreateIndex
CREATE INDEX "enrollments_student_id_deleted_at_idx" ON "enrollments"("student_id", "deleted_at");

-- CreateIndex
CREATE INDEX "enrollments_batch_id_deleted_at_ended_at_idx" ON "enrollments"("batch_id", "deleted_at", "ended_at");

-- CreateIndex
CREATE INDEX "fee_payments_workspace_id_deleted_at_created_at_id_idx" ON "fee_payments"("workspace_id", "deleted_at", "created_at", "id");

-- CreateIndex
CREATE INDEX "fee_payments_enrollment_id_deleted_at_paid_at_id_idx" ON "fee_payments"("enrollment_id", "deleted_at", "paid_at", "id");

-- CreateIndex
CREATE UNIQUE INDEX "fee_payments_workspace_id_receipt_number_key" ON "fee_payments"("workspace_id", "receipt_number");

-- AddForeignKey
ALTER TABLE "batches" ADD CONSTRAINT "batches_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_payments" ADD CONSTRAINT "fee_payments_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "enrollments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
