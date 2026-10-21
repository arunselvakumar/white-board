-- Clients master (CM-1101, ADR CM-0023 §2): who a Contract work Project is
-- built for and billed to. Touches construction_masters only (ADR-0030).

-- CreateTable
CREATE TABLE "construction_masters"."clients" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contact_person" TEXT,
    "mobile" TEXT,
    "email" TEXT,
    "address" TEXT,
    "pin_code" CHAR(6),
    "gstin" VARCHAR(15),
    "pan" VARCHAR(10),
    "tan" VARCHAR(10),
    "state_code" CHAR(2),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_by" TEXT NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "deleted_by" TEXT,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "clients_workspace_id_name_idx" ON "construction_masters"."clients"("workspace_id", "name");

-- Client names are unique in a Company among live rows, ignoring case.
CREATE UNIQUE INDEX "clients_workspace_name_live_key" ON "construction_masters"."clients"("workspace_id", lower("name")) WHERE "deleted_at" IS NULL;
