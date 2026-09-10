CREATE TABLE "todos" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "created_by_user_id" TEXT NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by_user_id" TEXT,

    CONSTRAINT "todos_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "todos_workspace_id_deleted_at_created_at_id_idx" ON "todos"("workspace_id", "deleted_at", "created_at", "id");
