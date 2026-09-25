CREATE UNIQUE INDEX "attendance_registers_active_batch_date_key"
ON "attendance_registers" ("workspace_id", "batch_id", "date")
WHERE "deleted_at" IS NULL;
