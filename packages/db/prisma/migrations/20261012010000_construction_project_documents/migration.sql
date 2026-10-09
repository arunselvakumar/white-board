-- Project documents (CM-414): files kept on a Project, filed under the
-- paper they are a copy of. The objects live in private storage.

-- CreateEnum
CREATE TYPE "construction_projects"."document_kind" AS ENUM ('tender', 'quotation', 'loa', 'client_order', 'agreement', 'other');

-- CreateTable
CREATE TABLE "construction_projects"."documents" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "project_id" UUID NOT NULL,
    "kind" "construction_projects"."document_kind" NOT NULL,
    "file_key" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "deleted_by" TEXT,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "documents_file_key_key" ON "construction_projects"."documents"("file_key");

-- CreateIndex
CREATE INDEX "documents_workspace_id_project_id_deleted_at_idx" ON "construction_projects"."documents"("workspace_id", "project_id", "deleted_at");

-- AddForeignKey
ALTER TABLE "construction_projects"."documents" ADD CONSTRAINT "documents_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "construction_projects"."projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
