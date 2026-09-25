-- CreateEnum
CREATE TYPE "teacher_kind" AS ENUM ('centre_teacher', 'visiting_tutor');

-- CreateEnum
CREATE TYPE "teacher_invitation_status" AS ENUM ('not_sent', 'sent', 'failed', 'accepted');

-- CreateTable
CREATE TABLE "teachers" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "created_by_user_id" TEXT NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "kind" "teacher_kind" NOT NULL,
    "phone" VARCHAR(32),
    "qualification_summary" VARCHAR(1000),
    "clerk_user_id" TEXT,
    "invitation_id" TEXT,
    "invitation_status" "teacher_invitation_status" NOT NULL DEFAULT 'not_sent',
    "deactivated_at" TIMESTAMP(3),
    "deactivated_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by_user_id" TEXT,

    CONSTRAINT "teachers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "batch_teacher_assignments" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "teacher_id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "assigned_by_user_id" TEXT NOT NULL,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unassigned_at" TIMESTAMP(3),
    "unassigned_by_user_id" TEXT,
    "deleted_at" TIMESTAMP(3),
    "deleted_by_user_id" TEXT,

    CONSTRAINT "batch_teacher_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "teachers_workspace_id_deleted_at_created_at_id_idx" ON "teachers"("workspace_id", "deleted_at", "created_at", "id");

-- CreateIndex
CREATE INDEX "teachers_workspace_id_clerk_user_id_idx" ON "teachers"("workspace_id", "clerk_user_id");

-- CreateIndex
CREATE INDEX "batch_teacher_assignments_workspace_id_teacher_id_unassigne_idx" ON "batch_teacher_assignments"("workspace_id", "teacher_id", "unassigned_at");

-- CreateIndex
CREATE INDEX "batch_teacher_assignments_workspace_id_batch_id_unassigned__idx" ON "batch_teacher_assignments"("workspace_id", "batch_id", "unassigned_at");

-- AddForeignKey
ALTER TABLE "batch_teacher_assignments" ADD CONSTRAINT "batch_teacher_assignments_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teachers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batch_teacher_assignments" ADD CONSTRAINT "batch_teacher_assignments_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
