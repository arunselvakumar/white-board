ALTER TABLE "teachers"
  ADD COLUMN "profile_details" JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN "photo_data" BYTEA,
  ADD COLUMN "photo_mime_type" VARCHAR(50),
  ADD COLUMN "photo_updated_at" TIMESTAMP(3),
  ADD COLUMN "id_number_encrypted" TEXT,
  ADD COLUMN "id_number_last4" VARCHAR(4),
  ADD COLUMN "bank_account_encrypted" TEXT,
  ADD COLUMN "bank_account_last4" VARCHAR(4);

CREATE TABLE "teacher_documents" (
  "id" UUID NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "teacher_id" UUID NOT NULL,
  "kind" VARCHAR(32) NOT NULL,
  "name" VARCHAR(200) NOT NULL,
  "mime_type" VARCHAR(50) NOT NULL,
  "encrypted_data" BYTEA NOT NULL,
  "size_bytes" INTEGER NOT NULL,
  "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "uploaded_by_user_id" TEXT NOT NULL,
  "deleted_at" TIMESTAMP(3),
  "deleted_by_user_id" TEXT,
  CONSTRAINT "teacher_documents_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "teacher_documents_workspace_id_teacher_id_deleted_at_uploaded_at_id_idx"
  ON "teacher_documents"("workspace_id", "teacher_id", "deleted_at", "uploaded_at", "id");

ALTER TABLE "teacher_documents" ADD CONSTRAINT "teacher_documents_teacher_id_fkey"
  FOREIGN KEY ("teacher_id") REFERENCES "teachers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
