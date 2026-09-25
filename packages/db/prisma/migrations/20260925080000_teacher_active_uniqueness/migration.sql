CREATE UNIQUE INDEX "teachers_workspace_email_active_key"
ON "teachers" ("workspace_id", "email")
WHERE "deleted_at" IS NULL;

CREATE UNIQUE INDEX "teachers_workspace_clerk_user_active_key"
ON "teachers" ("workspace_id", "clerk_user_id")
WHERE "deleted_at" IS NULL AND "clerk_user_id" IS NOT NULL;

CREATE UNIQUE INDEX "batch_teacher_assignments_active_key"
ON "batch_teacher_assignments" ("workspace_id", "teacher_id", "batch_id")
WHERE "deleted_at" IS NULL AND "unassigned_at" IS NULL;
