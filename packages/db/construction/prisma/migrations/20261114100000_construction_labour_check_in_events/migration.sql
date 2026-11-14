-- Check-In on a Project (ADR CM-0043): a log of Check In and Check Out
-- entries for Labours, Vendors and Site Engineers, each with a photo, the
-- server's time and the device's location.
--
-- Business effect: nothing changes for existing data. Every attendance day
-- already marked keeps its status, times and amounts; both new columns
-- start false, so no day is treated as coming from Check-In.
--
-- Schemas: construction_labour only (ADR-0030). `project_id` and a Site
-- Engineer's `person_id` name rows of other contexts by id, with no
-- foreign key.

-- CreateEnum
CREATE TYPE "construction_labour"."check_in_person_kind" AS ENUM ('labour', 'vendor', 'site_engineer');

-- CreateEnum
CREATE TYPE "construction_labour"."check_in_action" AS ENUM ('check_in', 'check_out');

-- AlterTable
ALTER TABLE "construction_labour"."labour_attendance" ADD COLUMN     "from_check_in" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "times_from_check_in" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "construction_labour"."check_in_events" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "project_id" UUID NOT NULL,
    "person_kind" "construction_labour"."check_in_person_kind" NOT NULL,
    "person_id" UUID NOT NULL,
    "action" "construction_labour"."check_in_action" NOT NULL,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL,
    "attendance_date" DATE NOT NULL,
    "photo_key" TEXT,
    "photo_removed_at" TIMESTAMPTZ(3),
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "accuracy_metres" DECIMAL(8,2),
    "outside_fence" BOOLEAN,
    "metres_outside" INTEGER,
    "voided_at" TIMESTAMPTZ(3),
    "voided_by" TEXT,
    "void_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,

    CONSTRAINT "check_in_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "check_in_events_workspace_id_project_id_attendance_date_occ_idx" ON "construction_labour"."check_in_events"("workspace_id", "project_id", "attendance_date", "occurred_at");

-- CreateIndex
CREATE INDEX "check_in_events_workspace_id_person_kind_person_id_occurred_idx" ON "construction_labour"."check_in_events"("workspace_id", "person_kind", "person_id", "occurred_at");

-- The retention job reads the oldest entries that still have a photo.
CREATE INDEX "check_in_events_photo_retention_idx" ON "construction_labour"."check_in_events"("occurred_at") WHERE "photo_key" IS NOT NULL;

-- Checks the domain also enforces.
ALTER TABLE "construction_labour"."check_in_events" ADD CONSTRAINT "check_in_events_photo_check" CHECK (
  -- An entry always has its photo, until the retention job removes it.
  ("photo_key" IS NOT NULL) <> ("photo_removed_at" IS NOT NULL)
);
ALTER TABLE "construction_labour"."check_in_events" ADD CONSTRAINT "check_in_events_location_check" CHECK (
  (("latitude" IS NULL) = ("longitude" IS NULL))
  AND ("latitude" IS NULL OR ("latitude" >= -90 AND "latitude" <= 90))
  AND ("longitude" IS NULL OR ("longitude" >= -180 AND "longitude" <= 180))
  AND ("accuracy_metres" IS NULL OR ("latitude" IS NOT NULL AND "accuracy_metres" >= 0))
  AND ("outside_fence" IS NULL OR "latitude" IS NOT NULL)
  AND (("outside_fence" IS NULL) = ("metres_outside" IS NULL))
  AND ("metres_outside" IS NULL OR "metres_outside" >= 0)
  AND ("outside_fence" IS DISTINCT FROM false OR "metres_outside" = 0)
);
ALTER TABLE "construction_labour"."check_in_events" ADD CONSTRAINT "check_in_events_void_check" CHECK (
  (("voided_at" IS NULL) = ("voided_by" IS NULL))
  AND (("voided_at" IS NULL) = ("void_reason" IS NULL))
  AND ("void_reason" IS NULL OR length(btrim("void_reason")) BETWEEN 1 AND 200)
);
-- Times that follow the log need times to follow.
ALTER TABLE "construction_labour"."labour_attendance" ADD CONSTRAINT "labour_attendance_check_in_times_check" CHECK (
  NOT "times_from_check_in" OR "check_in" IS NOT NULL
);
