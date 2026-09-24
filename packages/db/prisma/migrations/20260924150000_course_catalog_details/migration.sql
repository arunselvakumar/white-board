CREATE TYPE "course_duration_kind" AS ENUM ('fixed', 'flexible');
CREATE TYPE "course_duration_unit" AS ENUM ('days', 'weeks', 'months');

ALTER TABLE "courses"
  DROP COLUMN "duration",
  ADD COLUMN "duration_kind" "course_duration_kind" NOT NULL DEFAULT 'flexible',
  ADD COLUMN "duration_value" INTEGER,
  ADD COLUMN "duration_unit" "course_duration_unit",
  ADD COLUMN "code" VARCHAR(40),
  ADD COLUMN "category" VARCHAR(100),
  ADD COLUMN "total_learning_hours" INTEGER,
  ADD COLUMN "eligibility" TEXT,
  ADD COLUMN "learning_outcomes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "syllabus_outline" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "courses" ADD CONSTRAINT "courses_duration_consistent" CHECK (
  ("duration_kind" = 'flexible' AND "duration_value" IS NULL AND "duration_unit" IS NULL)
  OR ("duration_kind" = 'fixed' AND "duration_value" BETWEEN 1 AND 1000 AND "duration_unit" IS NOT NULL)
);
ALTER TABLE "courses" ADD CONSTRAINT "courses_learning_hours_positive" CHECK (
  "total_learning_hours" IS NULL OR "total_learning_hours" BETWEEN 1 AND 100000
);
CREATE UNIQUE INDEX "courses_workspace_code_active_key" ON "courses" ("workspace_id", "code") WHERE "deleted_at" IS NULL AND "code" IS NOT NULL;
