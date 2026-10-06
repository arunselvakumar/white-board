-- CreateEnum
CREATE TYPE "class_change_kind" AS ENUM ('cancelled', 'moved');

-- CreateTable
CREATE TABLE "class_changes" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "batch_id" UUID NOT NULL,
    "class_date" DATE NOT NULL,
    "start_time" VARCHAR(5) NOT NULL,
    "end_time" VARCHAR(5) NOT NULL,
    "kind" "class_change_kind" NOT NULL,
    "reason" VARCHAR(200),
    "moved_to_date" DATE,
    "moved_to_start_time" VARCHAR(5),
    "moved_to_end_time" VARCHAR(5),
    "created_by_user_id" TEXT NOT NULL,
    "updated_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by_user_id" TEXT,

    CONSTRAINT "class_changes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "holidays" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "reason" VARCHAR(200),
    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by_user_id" TEXT,

    CONSTRAINT "holidays_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "class_changes_workspace_id_batch_id_class_date_idx" ON "class_changes"("workspace_id", "batch_id", "class_date");

-- CreateIndex
CREATE INDEX "class_changes_workspace_id_deleted_at_class_date_idx" ON "class_changes"("workspace_id", "deleted_at", "class_date");

-- CreateIndex
CREATE INDEX "holidays_workspace_id_deleted_at_start_date_idx" ON "holidays"("workspace_id", "deleted_at", "start_date");

-- AddForeignKey
ALTER TABLE "class_changes" ADD CONSTRAINT "class_changes_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- One active change per original Class, and one active Moved Class per new slot (ADR-0028).
CREATE UNIQUE INDEX "class_changes_active_class_key"
ON "class_changes" ("batch_id", "class_date", "start_time")
WHERE "deleted_at" IS NULL;

CREATE UNIQUE INDEX "class_changes_active_moved_to_key"
ON "class_changes" ("batch_id", "moved_to_date", "moved_to_start_time")
WHERE "deleted_at" IS NULL AND "kind" = 'moved';

ALTER TABLE "class_changes" ADD CONSTRAINT "class_changes_moved_to_check" CHECK (
  ("kind" = 'cancelled' AND "moved_to_date" IS NULL AND "moved_to_start_time" IS NULL AND "moved_to_end_time" IS NULL)
  OR ("kind" = 'moved' AND "moved_to_date" IS NOT NULL AND "moved_to_start_time" IS NOT NULL AND "moved_to_end_time" IS NOT NULL)
);

ALTER TABLE "holidays" ADD CONSTRAINT "holidays_date_range_check" CHECK ("end_date" >= "start_date");
