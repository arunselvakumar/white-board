-- Measurement Book photos and send-back reasons (CM-1105, ADR CM-0023 §6).
-- Touches construction_contracts only (ADR-0030).
--
-- Business effect: a measurement sheet keeps its site photos through the
-- attachments service (CM-0014), like a Daily Worksheet's, in its own
-- table; they are not indexed in the Project Gallery. A sheet sent back to
-- draft (return) or reopened after its joint measurement keeps the reason,
-- shown on the sheet until it is submitted or checked again. No rows
-- exist yet, so nothing is backfilled.
ALTER TABLE "construction_contracts"."measurement_sheets"
  ADD COLUMN "return_reason" TEXT NULL,
  ADD COLUMN "reopen_reason" TEXT NULL;

CREATE TABLE "construction_contracts"."measurement_photos" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "project_id" UUID NOT NULL,
    "sheet_id" UUID NOT NULL,
    "file_key" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "thumb_key" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "deleted_by" TEXT,

    CONSTRAINT "measurement_photos_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "measurement_photos_file_key_key" ON "construction_contracts"."measurement_photos"("file_key");

CREATE INDEX "measurement_photos_workspace_id_sheet_id_deleted_at_idx" ON "construction_contracts"."measurement_photos"("workspace_id", "sheet_id", "deleted_at");

ALTER TABLE "construction_contracts"."measurement_photos" ADD CONSTRAINT "measurement_photos_sheet_id_fkey" FOREIGN KEY ("sheet_id") REFERENCES "construction_contracts"."measurement_sheets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
