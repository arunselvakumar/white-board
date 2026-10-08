-- Construction Management, organization context (ADR CM-0001). Runs in every
-- database packages/db migrates; only the construction app writes to it.
-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "construction_organization";

-- CreateTable
CREATE TABLE "construction_organization"."company_profiles" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "gstin" VARCHAR(15),
    "pan" VARCHAR(10),
    "address" TEXT,
    "currency" CHAR(3) NOT NULL DEFAULT 'INR',
    "is_indian" BOOLEAN NOT NULL DEFAULT true,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_by" TEXT NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "company_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "company_profiles_workspace_id_key" ON "construction_organization"."company_profiles"("workspace_id");
