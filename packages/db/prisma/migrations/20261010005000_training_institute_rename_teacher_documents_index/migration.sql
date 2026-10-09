-- Fixes Prisma drift only: Postgres cut this index name to 63 characters
-- when it was created, and Prisma expects the full name. No data changes.
-- IF EXISTS: databases that ran an earlier copy of this rename skip it.
ALTER INDEX IF EXISTS "training_institute"."teacher_documents_workspace_id_teacher_id_deleted_at_uploaded_a" RENAME TO "teacher_documents_workspace_id_teacher_id_deleted_at_upload_idx";
