-- Study Material, Homework, Submissions, and their attachments (WB-014, ADR-0033).
-- Written by hand from Prisma's diff; only adds objects in training_institute.
-- CreateEnum
CREATE TYPE "training_institute"."poster_role" AS ENUM ('owner', 'teacher');

-- CreateEnum
CREATE TYPE "training_institute"."submitter_role" AS ENUM ('student', 'parent');

-- CreateTable
CREATE TABLE "training_institute"."study_materials" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "batch_id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "note" TEXT,
    "link_url" VARCHAR(2048),
    "class_date" DATE,
    "posted_by_user_id" TEXT NOT NULL,
    "posted_by_role" "training_institute"."poster_role" NOT NULL,
    "posted_by_teacher_id" UUID,
    "updated_by_user_id" TEXT NOT NULL,
    "removed_at" TIMESTAMP(3),
    "removed_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "study_materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_institute"."homework" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "batch_id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "instructions" TEXT NOT NULL,
    "class_date" DATE NOT NULL,
    "due_on" DATE NOT NULL,
    "posted_by_user_id" TEXT NOT NULL,
    "posted_by_role" "training_institute"."poster_role" NOT NULL,
    "posted_by_teacher_id" UUID,
    "updated_by_user_id" TEXT NOT NULL,
    "removed_at" TIMESTAMP(3),
    "removed_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "homework_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_institute"."homework_submissions" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "homework_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "note" VARCHAR(1000),
    "submitted_at" TIMESTAMP(3) NOT NULL,
    "submitted_by_user_id" TEXT NOT NULL,
    "submitted_by_role" "training_institute"."submitter_role" NOT NULL,
    "updated_by_user_id" TEXT NOT NULL,
    "updated_by_role" "training_institute"."submitter_role" NOT NULL,
    "checked_at" TIMESTAMP(3),
    "checked_by_user_id" TEXT,
    "remark" VARCHAR(500),
    "withdrawn_at" TIMESTAMP(3),
    "withdrawn_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "homework_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_institute"."attachments" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "study_material_id" UUID,
    "homework_id" UUID,
    "submission_id" UUID,
    "name" VARCHAR(200) NOT NULL,
    "mime_type" VARCHAR(50) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "uploaded_by_user_id" TEXT NOT NULL,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),
    "deleted_by_user_id" TEXT,

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "study_materials_workspace_id_batch_id_created_at_idx" ON "training_institute"."study_materials"("workspace_id", "batch_id", "created_at");

-- CreateIndex
CREATE INDEX "homework_workspace_id_batch_id_created_at_idx" ON "training_institute"."homework"("workspace_id", "batch_id", "created_at");

-- CreateIndex
CREATE INDEX "homework_submissions_workspace_id_homework_id_idx" ON "training_institute"."homework_submissions"("workspace_id", "homework_id");

-- CreateIndex
CREATE INDEX "homework_submissions_workspace_id_student_id_idx" ON "training_institute"."homework_submissions"("workspace_id", "student_id");

-- CreateIndex
CREATE INDEX "attachments_study_material_id_deleted_at_idx" ON "training_institute"."attachments"("study_material_id", "deleted_at");

-- CreateIndex
CREATE INDEX "attachments_homework_id_deleted_at_idx" ON "training_institute"."attachments"("homework_id", "deleted_at");

-- CreateIndex
CREATE INDEX "attachments_submission_id_deleted_at_idx" ON "training_institute"."attachments"("submission_id", "deleted_at");

-- CreateIndex
CREATE INDEX "attachments_workspace_id_uploaded_by_user_id_uploaded_at_idx" ON "training_institute"."attachments"("workspace_id", "uploaded_by_user_id", "uploaded_at");

-- AddForeignKey
ALTER TABLE "training_institute"."study_materials" ADD CONSTRAINT "study_materials_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "training_institute"."batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_institute"."study_materials" ADD CONSTRAINT "study_materials_posted_by_teacher_id_fkey" FOREIGN KEY ("posted_by_teacher_id") REFERENCES "training_institute"."teachers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_institute"."homework" ADD CONSTRAINT "homework_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "training_institute"."batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_institute"."homework" ADD CONSTRAINT "homework_posted_by_teacher_id_fkey" FOREIGN KEY ("posted_by_teacher_id") REFERENCES "training_institute"."teachers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_institute"."homework_submissions" ADD CONSTRAINT "homework_submissions_homework_id_fkey" FOREIGN KEY ("homework_id") REFERENCES "training_institute"."homework"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_institute"."homework_submissions" ADD CONSTRAINT "homework_submissions_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "training_institute"."students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_institute"."attachments" ADD CONSTRAINT "attachments_study_material_id_fkey" FOREIGN KEY ("study_material_id") REFERENCES "training_institute"."study_materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_institute"."attachments" ADD CONSTRAINT "attachments_homework_id_fkey" FOREIGN KEY ("homework_id") REFERENCES "training_institute"."homework"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_institute"."attachments" ADD CONSTRAINT "attachments_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "training_institute"."homework_submissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- One live Submission per Homework and Student; undone ones keep withdrawn_at.
CREATE UNIQUE INDEX "homework_submissions_live_key"
ON "training_institute"."homework_submissions"("homework_id", "student_id")
WHERE "withdrawn_at" IS NULL;

-- Homework is due on or after its Class date.
ALTER TABLE "training_institute"."homework" ADD CONSTRAINT "homework_due_on_check" CHECK ("due_on" >= "class_date");

-- A Teacher's post names the Teacher; the Owner's doesn't.
ALTER TABLE "training_institute"."study_materials" ADD CONSTRAINT "study_materials_poster_check" CHECK (
    ("posted_by_role" = 'teacher') = ("posted_by_teacher_id" IS NOT NULL)
);
ALTER TABLE "training_institute"."homework" ADD CONSTRAINT "homework_poster_check" CHECK (
    ("posted_by_role" = 'teacher') = ("posted_by_teacher_id" IS NOT NULL)
);

-- An attachment belongs to at most one Study Material, Homework, or Submission.
-- With none it is an upload waiting to be attached (ADR-0033).
ALTER TABLE "training_institute"."attachments" ADD CONSTRAINT "attachments_owner_check" CHECK (
    num_nonnulls("study_material_id", "homework_id", "submission_id") <= 1
);
