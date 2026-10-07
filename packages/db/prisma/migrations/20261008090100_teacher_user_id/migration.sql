-- A Teacher links to the identity User who signs in as them (ADR-0034).
-- Renaming keeps the data and both indexes, including the hand-written
-- partial unique index.
ALTER TABLE "training_institute"."teachers" RENAME COLUMN "clerk_user_id" TO "user_id";

ALTER INDEX "training_institute"."teachers_workspace_id_clerk_user_id_idx" RENAME TO "teachers_workspace_id_user_id_idx";

ALTER INDEX "training_institute"."teachers_workspace_clerk_user_active_key" RENAME TO "teachers_workspace_user_active_key";
