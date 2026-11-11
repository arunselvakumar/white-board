-- A Site Engineer's profile (ADR CM-0037): personal, employment and bank
-- details on the Site Engineer (Supervisor) row. Every column is optional,
-- so existing Site Engineers keep working as they are. The bank account
-- number is stored encrypted, with the last four digits for masking.
-- Touches no other schema (ADR-0030).

-- CreateEnum
CREATE TYPE "construction_masters"."gender" AS ENUM ('male', 'female', 'other');

-- AlterTable
ALTER TABLE "construction_masters"."supervisors" ADD COLUMN     "employee_code" TEXT,
ADD COLUMN     "father_name" TEXT,
ADD COLUMN     "date_of_birth" DATE,
ADD COLUMN     "gender" "construction_masters"."gender",
ADD COLUMN     "blood_group" VARCHAR(3),
ADD COLUMN     "joining_date" DATE,
ADD COLUMN     "qualification" TEXT,
ADD COLUMN     "experience_years" INTEGER,
ADD COLUMN     "specialisation" TEXT,
ADD COLUMN     "bank_account_holder" TEXT,
ADD COLUMN     "bank_account_encrypted" TEXT,
ADD COLUMN     "bank_account_last4" VARCHAR(4),
ADD COLUMN     "bank_ifsc" VARCHAR(11),
ADD COLUMN     "bank_name" TEXT;

-- An Employee Code is unique among a Company's live Site Engineers.
CREATE UNIQUE INDEX "supervisors_workspace_id_employee_code_live_key"
  ON "construction_masters"."supervisors" ("workspace_id", lower("employee_code"))
  WHERE "deleted_at" IS NULL AND "employee_code" IS NOT NULL;
