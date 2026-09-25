DROP INDEX "teachers_workspace_email_active_key";
CREATE UNIQUE INDEX "teachers_workspace_email_active_key"
ON "teachers" ("workspace_id", "email")
WHERE "deleted_at" IS NULL AND "deactivated_at" IS NULL;

DROP INDEX "teachers_workspace_clerk_user_active_key";
CREATE UNIQUE INDEX "teachers_workspace_clerk_user_active_key"
ON "teachers" ("workspace_id", "clerk_user_id")
WHERE "deleted_at" IS NULL AND "deactivated_at" IS NULL AND "clerk_user_id" IS NOT NULL;
