-- CreateEnum
CREATE TYPE "attendance_status" AS ENUM ('unmarked', 'present', 'absent', 'late', 'excused');

-- CreateTable
CREATE TABLE "attendance_registers" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "batch_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "timezone" VARCHAR(64) NOT NULL,
    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by_user_id" TEXT,

    CONSTRAINT "attendance_registers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_marks" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "register_id" UUID NOT NULL,
    "enrollment_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "student_name_snapshot" VARCHAR(200) NOT NULL,
    "status" "attendance_status" NOT NULL DEFAULT 'unmarked',
    "note" VARCHAR(500),
    "marked_by_user_id" TEXT,
    "marked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by_user_id" TEXT,

    CONSTRAINT "attendance_marks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_mark_changes" (
    "id" UUID NOT NULL,
    "mark_id" UUID NOT NULL,
    "old_status" "attendance_status" NOT NULL,
    "new_status" "attendance_status" NOT NULL,
    "old_note" VARCHAR(500),
    "new_note" VARCHAR(500),
    "changed_by_user_id" TEXT NOT NULL,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_mark_changes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "attendance_registers_workspace_id_batch_id_date_idx" ON "attendance_registers"("workspace_id", "batch_id", "date");

-- CreateIndex
CREATE INDEX "attendance_marks_workspace_id_student_id_created_at_idx" ON "attendance_marks"("workspace_id", "student_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_marks_register_id_enrollment_id_key" ON "attendance_marks"("register_id", "enrollment_id");

-- CreateIndex
CREATE INDEX "attendance_mark_changes_mark_id_changed_at_idx" ON "attendance_mark_changes"("mark_id", "changed_at");

-- AddForeignKey
ALTER TABLE "attendance_registers" ADD CONSTRAINT "attendance_registers_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_marks" ADD CONSTRAINT "attendance_marks_register_id_fkey" FOREIGN KEY ("register_id") REFERENCES "attendance_registers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_marks" ADD CONSTRAINT "attendance_marks_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "enrollments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_marks" ADD CONSTRAINT "attendance_marks_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_mark_changes" ADD CONSTRAINT "attendance_mark_changes_mark_id_fkey" FOREIGN KEY ("mark_id") REFERENCES "attendance_marks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
