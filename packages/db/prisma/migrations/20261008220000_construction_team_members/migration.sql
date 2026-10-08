-- Team Members (CM-108).
-- CreateEnum
CREATE TYPE "construction_organization"."member_type" AS ENUM ('normal', 'hrms');

-- CreateEnum
CREATE TYPE "construction_organization"."team_member_status" AS ENUM ('joining_pending', 'active', 'rejected');

-- CreateTable
CREATE TABLE "construction_organization"."team_members" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "user_id" TEXT,
    "name" TEXT NOT NULL,
    "designation_id" UUID NOT NULL,
    "mobile" TEXT,
    "email" TEXT,
    "address" TEXT,
    "aadhaar_encrypted" TEXT,
    "aadhaar_last4" CHAR(4),
    "pan_encrypted" TEXT,
    "pan_last4" CHAR(4),
    "emergency_contact" TEXT,
    "member_type" "construction_organization"."member_type" NOT NULL DEFAULT 'normal',
    "is_owner" BOOLEAN NOT NULL DEFAULT false,
    "status" "construction_organization"."team_member_status" NOT NULL DEFAULT 'joining_pending',
    "invite_token" TEXT,
    "invited_at" TIMESTAMPTZ(3),
    "joined_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_by" TEXT NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "team_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "construction_organization"."team_member_projects" (
    "member_id" UUID NOT NULL,
    "project_id" TEXT NOT NULL,

    CONSTRAINT "team_member_projects_pkey" PRIMARY KEY ("member_id","project_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "team_members_invite_token_key" ON "construction_organization"."team_members"("invite_token");

-- CreateIndex
CREATE INDEX "team_members_workspace_id_created_at_idx" ON "construction_organization"."team_members"("workspace_id", "created_at");

-- CreateIndex
CREATE INDEX "team_members_user_id_idx" ON "construction_organization"."team_members"("user_id");

-- CreateIndex
CREATE INDEX "team_members_mobile_idx" ON "construction_organization"."team_members"("mobile");

-- One live Team Member per mobile, per email and per User in a Company (by
-- hand: Prisma cannot express partial indexes).
CREATE UNIQUE INDEX "team_members_live_mobile_key" ON "construction_organization"."team_members"("workspace_id", "mobile") WHERE "deleted_at" IS NULL AND "mobile" IS NOT NULL;
CREATE UNIQUE INDEX "team_members_live_email_key" ON "construction_organization"."team_members"("workspace_id", lower("email")) WHERE "deleted_at" IS NULL AND "email" IS NOT NULL;
CREATE UNIQUE INDEX "team_members_live_user_key" ON "construction_organization"."team_members"("workspace_id", "user_id") WHERE "deleted_at" IS NULL AND "user_id" IS NOT NULL;

ALTER TABLE "construction_organization"."team_members" ADD CONSTRAINT "team_members_mobile_or_email" CHECK ("mobile" IS NOT NULL OR "email" IS NOT NULL);

-- AddForeignKey
ALTER TABLE "construction_organization"."member_menu_permissions" ADD CONSTRAINT "member_menu_permissions_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "construction_organization"."team_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "construction_organization"."team_member_projects" ADD CONSTRAINT "team_member_projects_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "construction_organization"."team_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;
