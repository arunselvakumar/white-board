-- Company creation (CM-104): contact and country on the profile, and the
-- trial subscription.
-- AlterTable
ALTER TABLE "construction_organization"."company_profiles" ADD COLUMN "name" TEXT NOT NULL DEFAULT '',
ADD COLUMN "mobile" TEXT,
ADD COLUMN "email" TEXT,
ADD COLUMN "country" CHAR(2) NOT NULL DEFAULT 'IN';

-- CreateTable
CREATE TABLE "construction_organization"."subscriptions" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "plan_code" TEXT NOT NULL,
    "is_trial" BOOLEAN NOT NULL,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3) NOT NULL,
    "auto_renew" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_workspace_id_key" ON "construction_organization"."subscriptions"("workspace_id");
