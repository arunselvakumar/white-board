-- AlterTable
ALTER TABLE "preschool"."fee_payments" ADD COLUMN     "cancel_reason" VARCHAR(300),
ADD COLUMN     "cancelled_at" TIMESTAMP(3),
ADD COLUMN     "cancelled_by_name" VARCHAR(200),
ADD COLUMN     "cancelled_by_user_id" TEXT;
