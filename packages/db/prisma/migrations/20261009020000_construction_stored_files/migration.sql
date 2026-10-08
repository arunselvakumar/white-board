-- Company logo, My Profile photo and the files a Company keeps in storage (CM-115).
-- AlterTable
ALTER TABLE "construction_organization"."company_profiles" ADD COLUMN "logo_key" TEXT;

-- AlterTable
ALTER TABLE "construction_organization"."team_members" ADD COLUMN "photo_key" TEXT;

-- CreateTable
CREATE TABLE "construction_organization"."stored_files" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "stored_files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "stored_files_key_key" ON "construction_organization"."stored_files"("key");

-- CreateIndex
CREATE INDEX "stored_files_workspace_id_deleted_at_idx" ON "construction_organization"."stored_files"("workspace_id", "deleted_at");
