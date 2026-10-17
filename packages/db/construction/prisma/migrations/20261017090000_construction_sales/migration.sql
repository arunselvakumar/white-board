-- Sales context (CM-1001, ADR CM-0022): per-Project Funnel Stages, Lead
-- Sources and Lost Reasons; Inquiries with history, follow-ups, tasks and
-- files; unit sales profiles; Bookings with status history and files.
-- Touches construction_sales only (ADR-0030); the seed rows for existing
-- Projects are the next sales migration.


-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "construction_sales";

-- CreateEnum
CREATE TYPE "construction_sales"."interest_type" AS ENUM ('hot', 'warm', 'cold');

-- CreateEnum
CREATE TYPE "construction_sales"."inquiry_status" AS ENUM ('open', 'converted', 'lost');

-- CreateEnum
CREATE TYPE "construction_sales"."inquiry_event_type" AS ENUM ('created', 'assigned', 'lead_owner_changed', 'stage_moved', 'converted', 'lost', 'reopened');

-- CreateEnum
CREATE TYPE "construction_sales"."follow_up_activity" AS ENUM ('call', 'site_visit', 'meeting', 'whatsapp', 'email', 'other');

-- CreateEnum
CREATE TYPE "construction_sales"."inquiry_task_status" AS ENUM ('open', 'done');

-- CreateEnum
CREATE TYPE "construction_sales"."unavailable_reason" AS ENUM ('landowner_share', 'reserved', 'not_for_sale', 'other');

-- CreateEnum
CREATE TYPE "construction_sales"."area_unit" AS ENUM ('sq_ft', 'sq_m');

-- CreateEnum
CREATE TYPE "construction_sales"."booking_status" AS ENUM ('on_hold', 'booked', 'cancelled');

-- CreateEnum
CREATE TYPE "construction_sales"."document_type" AS ENUM ('inquiry', 'booking');

-- CreateEnum
CREATE TYPE "construction_sales"."file_role" AS ENUM ('visiting_card', 'booking_form', 'photo');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.

-- CreateTable
CREATE TABLE "construction_sales"."funnel_stages" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "project_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "is_seed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_by" TEXT NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "deleted_by" TEXT,

    CONSTRAINT "funnel_stages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "construction_sales"."lead_sources" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "project_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_seed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_by" TEXT NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "deleted_by" TEXT,

    CONSTRAINT "lead_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "construction_sales"."lost_reasons" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "project_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_seed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_by" TEXT NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "deleted_by" TEXT,

    CONSTRAINT "lost_reasons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "construction_sales"."inquiries" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "project_id" UUID NOT NULL,
    "inquiry_date" DATE NOT NULL,
    "name" TEXT NOT NULL,
    "mobile" TEXT,
    "email" TEXT,
    "address" TEXT,
    "occupation" TEXT,
    "interest_type" "construction_sales"."interest_type",
    "interested_wing_id" UUID,
    "interested_unit_type" TEXT,
    "lead_source_id" UUID,
    "funnel_stage_id" UUID,
    "status" "construction_sales"."inquiry_status" NOT NULL DEFAULT 'open',
    "next_follow_up_at" TIMESTAMPTZ(3),
    "next_follow_up_has_time" BOOLEAN NOT NULL DEFAULT false,
    "assignee_member_id" UUID,
    "lead_owner_member_id" UUID,
    "remarks" TEXT,
    "converted_unit_id" UUID,
    "converted_booking_id" UUID,
    "lost_reason_id" UUID,
    "lost_remarks" TEXT,
    "closed_at" TIMESTAMPTZ(3),
    "closed_by" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_by" TEXT NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "deleted_by" TEXT,

    CONSTRAINT "inquiries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "construction_sales"."inquiry_events" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "inquiry_id" UUID NOT NULL,
    "type" "construction_sales"."inquiry_event_type" NOT NULL,
    "details" JSONB,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor_user_id" TEXT NOT NULL,

    CONSTRAINT "inquiry_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "construction_sales"."follow_ups" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "project_id" UUID NOT NULL,
    "inquiry_id" UUID NOT NULL,
    "activity" "construction_sales"."follow_up_activity" NOT NULL,
    "done_at" TIMESTAMPTZ(3) NOT NULL,
    "remarks" TEXT,
    "from_stage_id" UUID,
    "to_stage_id" UUID,
    "next_follow_up_at" TIMESTAMPTZ(3),
    "next_follow_up_has_time" BOOLEAN NOT NULL DEFAULT false,
    "member_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "deleted_by" TEXT,

    CONSTRAINT "follow_ups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "construction_sales"."inquiry_tasks" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "inquiry_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "due_date" DATE,
    "assignee_member_id" UUID,
    "status" "construction_sales"."inquiry_task_status" NOT NULL DEFAULT 'open',
    "done_at" TIMESTAMPTZ(3),
    "done_by" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_by" TEXT NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "deleted_by" TEXT,

    CONSTRAINT "inquiry_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "construction_sales"."unit_profiles" (
    "unit_id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "project_id" UUID NOT NULL,
    "wing_id" UUID NOT NULL,
    "unit_type" TEXT,
    "carpet_area" DECIMAL(12,2),
    "built_up_area" DECIMAL(12,2),
    "super_built_up_area" DECIMAL(12,2),
    "area_unit" "construction_sales"."area_unit" NOT NULL DEFAULT 'sq_ft',
    "unavailable" BOOLEAN NOT NULL DEFAULT false,
    "unavailable_reason" "construction_sales"."unavailable_reason",
    "unavailable_note" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_by" TEXT NOT NULL,

    CONSTRAINT "unit_profiles_pkey" PRIMARY KEY ("unit_id")
);

-- CreateTable
CREATE TABLE "construction_sales"."bookings" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "project_id" UUID NOT NULL,
    "wing_id" UUID NOT NULL,
    "unit_id" UUID NOT NULL,
    "status" "construction_sales"."booking_status" NOT NULL,
    "booking_date" DATE NOT NULL,
    "hold_until" DATE,
    "customer_name" TEXT NOT NULL,
    "customer_mobile" TEXT,
    "customer_email" TEXT,
    "customer_address" TEXT,
    "referred_by_name" TEXT,
    "referred_by_contact" TEXT,
    "remarks" TEXT,
    "inquiry_id" UUID,
    "confirmed_on" DATE,
    "cancelled_on" DATE,
    "cancel_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_by" TEXT NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "deleted_by" TEXT,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "construction_sales"."booking_events" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "booking_id" UUID NOT NULL,
    "status" "construction_sales"."booking_status" NOT NULL,
    "on_date" DATE NOT NULL,
    "hold_until" DATE,
    "reason" TEXT,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor_user_id" TEXT NOT NULL,

    CONSTRAINT "booking_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "construction_sales"."document_files" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "project_id" UUID NOT NULL,
    "document_type" "construction_sales"."document_type" NOT NULL,
    "document_id" UUID NOT NULL,
    "role" "construction_sales"."file_role" NOT NULL,
    "file_key" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "thumb_key" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "deleted_by" TEXT,

    CONSTRAINT "document_files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "funnel_stages_workspace_id_project_id_sort_order_idx" ON "construction_sales"."funnel_stages"("workspace_id", "project_id", "sort_order");

-- CreateIndex
CREATE INDEX "lead_sources_workspace_id_project_id_idx" ON "construction_sales"."lead_sources"("workspace_id", "project_id");

-- CreateIndex
CREATE INDEX "lost_reasons_workspace_id_project_id_idx" ON "construction_sales"."lost_reasons"("workspace_id", "project_id");

-- CreateIndex
CREATE INDEX "inquiries_workspace_id_project_id_created_at_idx" ON "construction_sales"."inquiries"("workspace_id", "project_id", "created_at");

-- CreateIndex
CREATE INDEX "inquiries_workspace_id_project_id_inquiry_date_idx" ON "construction_sales"."inquiries"("workspace_id", "project_id", "inquiry_date");

-- CreateIndex
CREATE INDEX "inquiries_workspace_id_project_id_status_next_follow_up_at_idx" ON "construction_sales"."inquiries"("workspace_id", "project_id", "status", "next_follow_up_at");

-- CreateIndex
CREATE INDEX "inquiries_workspace_id_project_id_mobile_idx" ON "construction_sales"."inquiries"("workspace_id", "project_id", "mobile");

-- CreateIndex
CREATE INDEX "inquiries_workspace_id_assignee_member_id_idx" ON "construction_sales"."inquiries"("workspace_id", "assignee_member_id");

-- CreateIndex
CREATE INDEX "inquiry_events_workspace_id_inquiry_id_occurred_at_idx" ON "construction_sales"."inquiry_events"("workspace_id", "inquiry_id", "occurred_at");

-- CreateIndex
CREATE INDEX "follow_ups_workspace_id_inquiry_id_done_at_idx" ON "construction_sales"."follow_ups"("workspace_id", "inquiry_id", "done_at");

-- CreateIndex
CREATE INDEX "follow_ups_workspace_id_project_id_done_at_idx" ON "construction_sales"."follow_ups"("workspace_id", "project_id", "done_at");

-- CreateIndex
CREATE INDEX "inquiry_tasks_workspace_id_inquiry_id_idx" ON "construction_sales"."inquiry_tasks"("workspace_id", "inquiry_id");

-- CreateIndex
CREATE INDEX "unit_profiles_workspace_id_project_id_wing_id_idx" ON "construction_sales"."unit_profiles"("workspace_id", "project_id", "wing_id");

-- CreateIndex
CREATE INDEX "bookings_workspace_id_project_id_created_at_idx" ON "construction_sales"."bookings"("workspace_id", "project_id", "created_at");

-- CreateIndex
CREATE INDEX "bookings_workspace_id_project_id_booking_date_idx" ON "construction_sales"."bookings"("workspace_id", "project_id", "booking_date");

-- CreateIndex
CREATE INDEX "bookings_workspace_id_unit_id_idx" ON "construction_sales"."bookings"("workspace_id", "unit_id");

-- CreateIndex
CREATE INDEX "bookings_workspace_id_wing_id_idx" ON "construction_sales"."bookings"("workspace_id", "wing_id");

-- CreateIndex
CREATE INDEX "bookings_inquiry_id_idx" ON "construction_sales"."bookings"("inquiry_id");

-- CreateIndex
CREATE INDEX "booking_events_workspace_id_booking_id_occurred_at_idx" ON "construction_sales"."booking_events"("workspace_id", "booking_id", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "document_files_file_key_key" ON "construction_sales"."document_files"("file_key");

-- CreateIndex
CREATE INDEX "document_files_workspace_id_document_type_document_id_delet_idx" ON "construction_sales"."document_files"("workspace_id", "document_type", "document_id", "deleted_at");

-- AddForeignKey
ALTER TABLE "construction_sales"."inquiry_events" ADD CONSTRAINT "inquiry_events_inquiry_id_fkey" FOREIGN KEY ("inquiry_id") REFERENCES "construction_sales"."inquiries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "construction_sales"."follow_ups" ADD CONSTRAINT "follow_ups_inquiry_id_fkey" FOREIGN KEY ("inquiry_id") REFERENCES "construction_sales"."inquiries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "construction_sales"."inquiry_tasks" ADD CONSTRAINT "inquiry_tasks_inquiry_id_fkey" FOREIGN KEY ("inquiry_id") REFERENCES "construction_sales"."inquiries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "construction_sales"."booking_events" ADD CONSTRAINT "booking_events_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "construction_sales"."bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Live names are unique per Project, ignoring case (CM-0022 §2).
CREATE UNIQUE INDEX "funnel_stages_project_name_live_key"
    ON "construction_sales"."funnel_stages" ("project_id", lower("name"))
    WHERE "deleted_at" IS NULL;
CREATE UNIQUE INDEX "lead_sources_project_name_live_key"
    ON "construction_sales"."lead_sources" ("project_id", lower("name"))
    WHERE "deleted_at" IS NULL;
CREATE UNIQUE INDEX "lost_reasons_project_name_live_key"
    ON "construction_sales"."lost_reasons" ("project_id", lower("name"))
    WHERE "deleted_at" IS NULL;

-- One active booking per unit: On Hold or Booked (CM-0022 §7).
CREATE UNIQUE INDEX "bookings_unit_active_key"
    ON "construction_sales"."bookings" ("unit_id")
    WHERE "deleted_at" IS NULL AND "status" IN ('on_hold', 'booked');

-- Duplicate-lead lookups by email ignore case (CM-0022 §3).
CREATE INDEX "inquiries_project_email_lower_idx"
    ON "construction_sales"."inquiries" ("workspace_id", "project_id", lower("email"))
    WHERE "deleted_at" IS NULL AND "email" IS NOT NULL;
