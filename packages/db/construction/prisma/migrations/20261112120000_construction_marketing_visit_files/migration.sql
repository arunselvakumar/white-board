-- CreateTable
CREATE TABLE "construction_marketing"."visit_files" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "visit_id" UUID NOT NULL,
    "file_key" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "thumb_key" TEXT,
    "caption" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(3),
    "deleted_by" TEXT,

    CONSTRAINT "visit_files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "visit_files_file_key_key" ON "construction_marketing"."visit_files"("file_key");

-- CreateIndex
CREATE INDEX "visit_files_workspace_id_visit_id_created_at_idx" ON "construction_marketing"."visit_files"("workspace_id", "visit_id", "created_at");

-- AddForeignKey
ALTER TABLE "construction_marketing"."visit_files" ADD CONSTRAINT "visit_files_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "construction_marketing"."visits"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
