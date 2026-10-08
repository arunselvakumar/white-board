-- The Permission Matrix, one row per Team Member per menu (ADR CM-0003).
-- CreateTable
CREATE TABLE "construction_organization"."member_menu_permissions" (
    "workspace_id" TEXT NOT NULL,
    "member_id" UUID NOT NULL,
    "menu" TEXT NOT NULL,
    "flags" INTEGER NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" TEXT NOT NULL,

    CONSTRAINT "member_menu_permissions_pkey" PRIMARY KEY ("member_id","menu")
);

-- CreateIndex
CREATE INDEX "member_menu_permissions_workspace_id_menu_idx" ON "construction_organization"."member_menu_permissions"("workspace_id", "menu");
