-- A staff member's salary is set up like a Labour's wage (ADR CM-0033 §3):
-- Daily or Monthly, the amount, overtime per hour, working hours per day and
-- weekly holidays. The amount stays optional. Every existing monthly salary
-- (ADR CM-0032) moves to a Monthly salary of the same amount. Touches no
-- other schema (ADR-0030).

-- CreateEnum
CREATE TYPE "construction_organization"."salary_type" AS ENUM ('daily', 'monthly');

-- AlterTable
ALTER TABLE "construction_organization"."team_members"
  ADD COLUMN "salary_type" "construction_organization"."salary_type" NOT NULL DEFAULT 'monthly',
  ADD COLUMN "salary_per_day" INTEGER,
  ADD COLUMN "salary_per_month" INTEGER,
  ADD COLUMN "overtime_wage_per_hour" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "working_hours_per_day" DECIMAL(4,2) NOT NULL DEFAULT 8,
  ADD COLUMN "weekly_holidays" INTEGER[] NOT NULL DEFAULT ARRAY[0]::INTEGER[];

UPDATE "construction_organization"."team_members"
   SET "salary_per_month" = "monthly_salary"
 WHERE "monthly_salary" IS NOT NULL AND "monthly_salary" > 0;

ALTER TABLE "construction_organization"."team_members" DROP COLUMN "monthly_salary";
