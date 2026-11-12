-- CreateEnum
CREATE TYPE "construction_marketing"."check_location" AS ENUM ('recorded', 'refused', 'unavailable');

-- AlterTable
ALTER TABLE "construction_marketing"."visits" ADD COLUMN     "check_in_accuracy" DOUBLE PRECISION,
ADD COLUMN     "check_in_at" TIMESTAMPTZ(3),
ADD COLUMN     "check_in_by" TEXT,
ADD COLUMN     "check_in_latitude" DOUBLE PRECISION,
ADD COLUMN     "check_in_location" "construction_marketing"."check_location",
ADD COLUMN     "check_in_longitude" DOUBLE PRECISION,
ADD COLUMN     "check_out_accuracy" DOUBLE PRECISION,
ADD COLUMN     "check_out_at" TIMESTAMPTZ(3),
ADD COLUMN     "check_out_by" TEXT,
ADD COLUMN     "check_out_latitude" DOUBLE PRECISION,
ADD COLUMN     "check_out_location" "construction_marketing"."check_location",
ADD COLUMN     "check_out_longitude" DOUBLE PRECISION;
