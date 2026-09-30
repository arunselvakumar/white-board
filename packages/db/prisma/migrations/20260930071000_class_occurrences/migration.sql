CREATE TABLE "class_occurrences" (
  "id" UUID NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "batch_id" UUID NOT NULL,
  "class_date" DATE NOT NULL,
  "start_time" VARCHAR(5) NOT NULL,
  "end_time" VARCHAR(5) NOT NULL,
  "provider_meeting_id" VARCHAR(100),
  "status" VARCHAR(20) NOT NULL DEFAULT 'starting',
  "recording_id" VARCHAR(100),
  "recording_status" VARCHAR(20) NOT NULL DEFAULT 'pending',
  "recording_object_key" VARCHAR(1024),
  "started_by_user_id" TEXT NOT NULL,
  "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ended_at" TIMESTAMP(3),
  CONSTRAINT "class_occurrences_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "class_occurrences_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "class_occurrences_provider_meeting_id_key" ON "class_occurrences"("provider_meeting_id");
CREATE UNIQUE INDEX "class_occurrences_batch_id_class_date_start_time_key" ON "class_occurrences"("batch_id", "class_date", "start_time");
CREATE INDEX "class_occurrences_workspace_id_batch_id_class_date_idx" ON "class_occurrences"("workspace_id", "batch_id", "class_date");
