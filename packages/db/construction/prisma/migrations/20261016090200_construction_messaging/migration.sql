-- M9 messaging context (ADR CM-0021 §6): notifications, their delivery
-- log, web push subscriptions and per-user push mutes.

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "construction_messaging";

-- CreateEnum
CREATE TYPE "construction_messaging"."delivery_channel" AS ENUM ('in_app', 'web_push');

-- CreateEnum
CREATE TYPE "construction_messaging"."delivery_status" AS ENUM ('sent', 'failed', 'skipped');

-- CreateTable
CREATE TABLE "construction_messaging"."notifications" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "recipient_user_id" TEXT NOT NULL,
    "menu" TEXT,
    "project_id" UUID,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "link" JSONB,
    "attachment" JSONB,
    "source_key" TEXT,
    "read_at" TIMESTAMPTZ(3),
    "deleted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "construction_messaging"."notification_deliveries" (
    "id" UUID NOT NULL,
    "notification_id" UUID,
    "workspace_id" TEXT NOT NULL,
    "recipient_user_id" TEXT NOT NULL,
    "channel" "construction_messaging"."delivery_channel" NOT NULL,
    "status" "construction_messaging"."delivery_status" NOT NULL,
    "push_subscription_id" UUID,
    "error" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "construction_messaging"."push_subscriptions" (
    "id" UUID NOT NULL,
    "user_id" TEXT NOT NULL,
    "session_id" TEXT,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMPTZ(3),

    CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "construction_messaging"."notification_preferences" (
    "user_id" TEXT NOT NULL,
    "muted_groups" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("user_id")
);

-- CreateIndex
CREATE INDEX "notifications_workspace_id_recipient_user_id_created_at_idx" ON "construction_messaging"."notifications"("workspace_id", "recipient_user_id", "created_at");

-- CreateIndex
CREATE INDEX "notifications_created_at_idx" ON "construction_messaging"."notifications"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_recipient_user_id_source_key_key" ON "construction_messaging"."notifications"("recipient_user_id", "source_key");

-- CreateIndex
CREATE INDEX "notification_deliveries_workspace_id_created_at_idx" ON "construction_messaging"."notification_deliveries"("workspace_id", "created_at");

-- CreateIndex
CREATE INDEX "notification_deliveries_created_at_idx" ON "construction_messaging"."notification_deliveries"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "push_subscriptions_endpoint_key" ON "construction_messaging"."push_subscriptions"("endpoint");

-- CreateIndex
CREATE INDEX "push_subscriptions_user_id_idx" ON "construction_messaging"."push_subscriptions"("user_id");

-- CreateIndex
CREATE INDEX "push_subscriptions_session_id_idx" ON "construction_messaging"."push_subscriptions"("session_id");

-- AddForeignKey
ALTER TABLE "construction_messaging"."notification_deliveries" ADD CONSTRAINT "notification_deliveries_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "construction_messaging"."notifications"("id") ON DELETE SET NULL ON UPDATE CASCADE;
