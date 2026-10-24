-- "Sign in as" a customer by White Board staff (ADR CM-0029). A Session
-- remembers which staff email opened it, and every impersonation is kept in
-- its own table. Touches only the identity schema (ADR-0030).

-- AlterTable
ALTER TABLE "identity"."sessions" ADD COLUMN     "impersonated_by" TEXT;

-- CreateTable
CREATE TABLE "identity"."impersonations" (
    "id" TEXT NOT NULL,
    "admin_email" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "customer_email" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "impersonations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "impersonations_user_id_idx" ON "identity"."impersonations"("user_id");

-- CreateIndex
CREATE INDEX "impersonations_admin_email_idx" ON "identity"."impersonations"("admin_email");
