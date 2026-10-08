-- Mobile OTP sign-in for Construction Management (ADR CM-0002). Whiteboard
-- never sets these columns.
-- AlterTable
ALTER TABLE "identity"."users" ADD COLUMN "phone_number" TEXT,
ADD COLUMN "phone_number_verified" BOOLEAN;

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_number_key" ON "identity"."users"("phone_number");
