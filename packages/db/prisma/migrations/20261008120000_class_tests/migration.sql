-- Tests, results, and the change history of published results (WB-016, ADR-0037).
-- Written by hand from Prisma's diff; only adds objects in training_institute.
-- CreateEnum
CREATE TYPE "training_institute"."class_test_scope" AS ENUM ('batch', 'student');

-- CreateEnum
CREATE TYPE "training_institute"."test_result_status" AS ENUM ('scored', 'absent', 'exempt');

-- CreateTable
CREATE TABLE "training_institute"."class_tests" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "batch_id" UUID NOT NULL,
    "scope" "training_institute"."class_test_scope" NOT NULL,
    "student_id" UUID,
    "name" VARCHAR(200) NOT NULL,
    "held_on" DATE NOT NULL,
    "max_marks" INTEGER NOT NULL,
    "pass_marks" INTEGER,
    "topic" VARCHAR(1000),
    "created_by_user_id" TEXT NOT NULL,
    "created_by_role" "training_institute"."poster_role" NOT NULL,
    "created_by_teacher_id" UUID,
    "updated_by_user_id" TEXT NOT NULL,
    "published_at" TIMESTAMP(3),
    "published_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by_user_id" TEXT,

    CONSTRAINT "class_tests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_institute"."test_results" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "test_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "status" "training_institute"."test_result_status" NOT NULL,
    "marks" DECIMAL(6,1),
    "remark" VARCHAR(500),
    "updated_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "test_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_institute"."test_result_changes" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "result_id" UUID NOT NULL,
    "old_status" "training_institute"."test_result_status" NOT NULL,
    "new_status" "training_institute"."test_result_status" NOT NULL,
    "old_marks" DECIMAL(6,1),
    "new_marks" DECIMAL(6,1),
    "old_remark" VARCHAR(500),
    "new_remark" VARCHAR(500),
    "changed_by_user_id" TEXT NOT NULL,
    "changed_by_role" "training_institute"."poster_role" NOT NULL,
    "changed_by_teacher_id" UUID,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "test_result_changes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "class_tests_workspace_id_batch_id_held_on_idx" ON "training_institute"."class_tests"("workspace_id", "batch_id", "held_on");

-- CreateIndex
CREATE INDEX "test_results_workspace_id_student_id_idx" ON "training_institute"."test_results"("workspace_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "test_results_test_id_student_id_key" ON "training_institute"."test_results"("test_id", "student_id");

-- CreateIndex
CREATE INDEX "test_result_changes_result_id_changed_at_idx" ON "training_institute"."test_result_changes"("result_id", "changed_at");

-- AddForeignKey
ALTER TABLE "training_institute"."class_tests" ADD CONSTRAINT "class_tests_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "training_institute"."batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_institute"."class_tests" ADD CONSTRAINT "class_tests_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "training_institute"."students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_institute"."class_tests" ADD CONSTRAINT "class_tests_created_by_teacher_id_fkey" FOREIGN KEY ("created_by_teacher_id") REFERENCES "training_institute"."teachers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_institute"."test_results" ADD CONSTRAINT "test_results_test_id_fkey" FOREIGN KEY ("test_id") REFERENCES "training_institute"."class_tests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_institute"."test_results" ADD CONSTRAINT "test_results_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "training_institute"."students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_institute"."test_result_changes" ADD CONSTRAINT "test_result_changes_result_id_fkey" FOREIGN KEY ("result_id") REFERENCES "training_institute"."test_results"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_institute"."test_result_changes" ADD CONSTRAINT "test_result_changes_changed_by_teacher_id_fkey" FOREIGN KEY ("changed_by_teacher_id") REFERENCES "training_institute"."teachers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A single-student Test names its Student; a whole-batch Test doesn't.
ALTER TABLE "training_institute"."class_tests" ADD CONSTRAINT "class_tests_scope_check" CHECK (
    ("scope" = 'student') = ("student_id" IS NOT NULL)
);

-- Maximum 1 to 1000; a pass mark, if set, from 0 to the maximum.
ALTER TABLE "training_institute"."class_tests" ADD CONSTRAINT "class_tests_marks_check" CHECK (
    "max_marks" BETWEEN 1 AND 1000
    AND ("pass_marks" IS NULL OR "pass_marks" BETWEEN 0 AND "max_marks")
);

-- A Teacher's Test names the Teacher; the Owner's doesn't.
ALTER TABLE "training_institute"."class_tests" ADD CONSTRAINT "class_tests_creator_check" CHECK (
    ("created_by_role" = 'teacher') = ("created_by_teacher_id" IS NOT NULL)
);

-- Only a scored result has marks: zero or more, in half-mark steps.
ALTER TABLE "training_institute"."test_results" ADD CONSTRAINT "test_results_marks_check" CHECK (
    ("status" = 'scored') = ("marks" IS NOT NULL)
    AND ("marks" IS NULL OR ("marks" >= 0 AND "marks" * 2 = trunc("marks" * 2)))
);

-- A Teacher's change names the Teacher; the Owner's doesn't.
ALTER TABLE "training_institute"."test_result_changes" ADD CONSTRAINT "test_result_changes_changer_check" CHECK (
    ("changed_by_role" = 'teacher') = ("changed_by_teacher_id" IS NOT NULL)
);
