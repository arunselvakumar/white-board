-- CreateTable
CREATE TABLE "construction_marketing"."visit_targets" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "member_id" UUID NOT NULL,
    "effective_month" DATE NOT NULL,
    "target" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_by" TEXT NOT NULL,

    CONSTRAINT "visit_targets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "visit_targets_workspace_id_member_id_effective_month_key" ON "construction_marketing"."visit_targets"("workspace_id", "member_id", "effective_month");
