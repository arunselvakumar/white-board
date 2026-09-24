CREATE UNIQUE INDEX "enrollments_active_student_batch_key"
ON "enrollments" ("workspace_id", "student_id", "batch_id")
WHERE "deleted_at" IS NULL AND "ended_at" IS NULL;
