-- Move every Training Institute table and enum from `public` into its own
-- Postgres schema (ADR-0030). Written by hand: Prisma's generated diff drops
-- and recreates the tables, which would lose data.
--
-- `SET SCHEMA` changes catalog metadata only. Rows are not rewritten, and each
-- table's indexes (including the hand-written partial unique indexes),
-- constraints, and foreign keys move with it. Columns keep pointing at the
-- same enum types by OID, so moving the types does not touch the columns.

CREATE SCHEMA IF NOT EXISTS "training_institute";

-- Enums
ALTER TYPE "public"."class_mode" SET SCHEMA "training_institute";
ALTER TYPE "public"."meeting_option" SET SCHEMA "training_institute";
ALTER TYPE "public"."class_change_kind" SET SCHEMA "training_institute";
ALTER TYPE "public"."timing_source" SET SCHEMA "training_institute";
ALTER TYPE "public"."fee_plan_type" SET SCHEMA "training_institute";
ALTER TYPE "public"."fee_payment_method" SET SCHEMA "training_institute";
ALTER TYPE "public"."course_duration_kind" SET SCHEMA "training_institute";
ALTER TYPE "public"."course_duration_unit" SET SCHEMA "training_institute";
ALTER TYPE "public"."teacher_kind" SET SCHEMA "training_institute";
ALTER TYPE "public"."teacher_invitation_status" SET SCHEMA "training_institute";
ALTER TYPE "public"."attendance_status" SET SCHEMA "training_institute";

-- Tables
ALTER TABLE "public"."courses" SET SCHEMA "training_institute";
ALTER TABLE "public"."batches" SET SCHEMA "training_institute";
ALTER TABLE "public"."class_occurrences" SET SCHEMA "training_institute";
ALTER TABLE "public"."class_changes" SET SCHEMA "training_institute";
ALTER TABLE "public"."holidays" SET SCHEMA "training_institute";
ALTER TABLE "public"."teachers" SET SCHEMA "training_institute";
ALTER TABLE "public"."teacher_documents" SET SCHEMA "training_institute";
ALTER TABLE "public"."batch_teacher_assignments" SET SCHEMA "training_institute";
ALTER TABLE "public"."students" SET SCHEMA "training_institute";
ALTER TABLE "public"."enrollments" SET SCHEMA "training_institute";
ALTER TABLE "public"."attendance_registers" SET SCHEMA "training_institute";
ALTER TABLE "public"."attendance_marks" SET SCHEMA "training_institute";
ALTER TABLE "public"."attendance_mark_changes" SET SCHEMA "training_institute";
ALTER TABLE "public"."fee_payments" SET SCHEMA "training_institute";
