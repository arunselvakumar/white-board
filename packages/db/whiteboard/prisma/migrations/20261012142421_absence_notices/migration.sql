-- Absence Notices and in-app Notifications (ADR-0041, issue #61).
-- Touches only the training_institute schema (ADR-0030).

-- CreateEnum
CREATE TYPE "training_institute"."absence_reason" AS ENUM ('sick', 'exam', 'travel', 'family', 'other');

-- CreateEnum
CREATE TYPE "training_institute"."notification_kind" AS ENUM ('absence_notice_given', 'absence_notice_withdrawn');

-- AlterEnum
ALTER TYPE "training_institute"."attendance_status" ADD VALUE 'informed_absent';

-- CreateTable
CREATE TABLE "training_institute"."absence_notices" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "student_id" UUID NOT NULL,
    "enrollment_id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "class_date" DATE NOT NULL,
    "start_time" VARCHAR(5) NOT NULL,
    "end_time" VARCHAR(5) NOT NULL,
    "reason" "training_institute"."absence_reason" NOT NULL,
    "note" VARCHAR(300),
    "given_at" TIMESTAMP(3) NOT NULL,
    "given_by_user_id" TEXT NOT NULL,
    "given_by_role" "training_institute"."submitter_role" NOT NULL,
    "given_by_name" VARCHAR(200) NOT NULL,
    "withdrawn_at" TIMESTAMP(3),
    "withdrawn_by_user_id" TEXT,
    "withdrawn_by_role" "training_institute"."submitter_role",
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "absence_notices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_institute"."notifications" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "recipient_user_id" TEXT NOT NULL,
    "kind" "training_institute"."notification_kind" NOT NULL,
    "payload" JSONB NOT NULL,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "absence_notices_workspace_id_batch_id_class_date_idx" ON "training_institute"."absence_notices"("workspace_id", "batch_id", "class_date");

-- CreateIndex
CREATE INDEX "absence_notices_workspace_id_student_id_class_date_idx" ON "training_institute"."absence_notices"("workspace_id", "student_id", "class_date");

-- CreateIndex
CREATE INDEX "notifications_workspace_id_recipient_user_id_created_at_id_idx" ON "training_institute"."notifications"("workspace_id", "recipient_user_id", "created_at", "id");

-- AddForeignKey
ALTER TABLE "training_institute"."absence_notices" ADD CONSTRAINT "absence_notices_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "training_institute"."students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_institute"."absence_notices" ADD CONSTRAINT "absence_notices_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "training_institute"."enrollments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_institute"."absence_notices" ADD CONSTRAINT "absence_notices_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "training_institute"."batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- One live Absence Notice per Enrollment and Class; withdrawn ones are kept.
CREATE UNIQUE INDEX "absence_notices_active_enrollment_class_key" ON "training_institute"."absence_notices"("workspace_id", "enrollment_id", "class_date", "start_time") WHERE "withdrawn_at" IS NULL;

-- The bell's unread count.
CREATE INDEX "notifications_unread_idx" ON "training_institute"."notifications"("workspace_id", "recipient_user_id") WHERE "read_at" IS NULL;
