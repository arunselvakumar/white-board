-- Contract details and custom fields on a Project (CM-413). Every new
-- column is optional, so existing Projects keep working unchanged.

-- AlterTable
ALTER TABLE "construction_projects"."projects" ADD COLUMN     "agreement_date" DATE,
ADD COLUMN     "agreement_no" TEXT,
ADD COLUMN     "client_name" TEXT,
ADD COLUMN     "client_order_date" DATE,
ADD COLUMN     "client_order_no" TEXT,
ADD COLUMN     "client_phone" TEXT,
ADD COLUMN     "loa_date" DATE,
ADD COLUMN     "loa_no" TEXT,
ADD COLUMN     "order_value" BIGINT,
ADD COLUMN     "quotation_date" DATE,
ADD COLUMN     "quotation_no" TEXT,
ADD COLUMN     "tender_ref" TEXT;

-- CreateTable
CREATE TABLE "construction_projects"."custom_fields" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "project_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "custom_fields_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "custom_fields_project_id_position_idx" ON "construction_projects"."custom_fields"("project_id", "position");

-- CreateIndex
CREATE INDEX "custom_fields_workspace_id_idx" ON "construction_projects"."custom_fields"("workspace_id");

-- AddForeignKey
ALTER TABLE "construction_projects"."custom_fields" ADD CONSTRAINT "custom_fields_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "construction_projects"."projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- One field per label on a Project, ignoring case ("Site engineer" and
-- "site Engineer" are the same field).
CREATE UNIQUE INDEX "custom_fields_project_label_key" ON "construction_projects"."custom_fields"("project_id", lower("label"));
