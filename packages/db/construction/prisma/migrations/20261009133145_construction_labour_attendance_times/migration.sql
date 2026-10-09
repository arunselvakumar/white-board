-- Check-in, check-out and working hours for labour attendance (ADR CM-0011).
-- Every existing Labour and attendance day gets 8 working hours; existing
-- days have no times and their overtime lines stay manual, so no amount
-- changes.

-- AlterTable
ALTER TABLE "construction_labour"."labour_attendance" ADD COLUMN     "break_minutes" INTEGER,
ADD COLUMN     "check_in" CHAR(5),
ADD COLUMN     "check_out" CHAR(5),
ADD COLUMN     "working_hours" DECIMAL(4,2) NOT NULL DEFAULT 8;

-- AlterTable
ALTER TABLE "construction_labour"."labour_overtime" ADD COLUMN     "from_times" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "construction_labour"."labours" ADD COLUMN     "working_hours_per_day" DECIMAL(4,2) NOT NULL DEFAULT 8;

-- Checks the domain also enforces.
ALTER TABLE "construction_labour"."labours" ADD CONSTRAINT "labours_working_hours_check" CHECK ("working_hours_per_day" > 0 AND "working_hours_per_day" <= 24);
ALTER TABLE "construction_labour"."labour_attendance" ADD CONSTRAINT "labour_attendance_times_check" CHECK (
  ("check_in" IS NULL OR "check_in" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
  AND ("check_out" IS NULL OR "check_out" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
  AND ("check_out" IS NULL OR "check_in" IS NOT NULL)
  AND ("check_in" IS NULL OR "status" IN ('present', 'half_day'))
  AND (("check_in" IS NULL) = ("break_minutes" IS NULL))
  AND ("break_minutes" IS NULL OR ("break_minutes" >= 0 AND "break_minutes" <= 720))
  AND "working_hours" > 0 AND "working_hours" <= 24
);
