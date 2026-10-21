-- Contracts context (CM-1101, ADR CM-0023 §1–§10): Item library with rate
-- analysis; a Project's BOQ, sections and Variations; Work Orders with
-- revisions, lines and issued materials; the Measurement Book; RA and
-- escalation bills both ways with lines and deductions; advances, bank
-- guarantees, retention releases; price indices and escalation clauses.
-- Touches construction_contracts only (ADR-0030).

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "construction_contracts";

-- CreateEnum
CREATE TYPE "construction_contracts"."analysis_kind" AS ENUM ('material', 'labour', 'equipment', 'lump_sum');

-- CreateEnum
CREATE TYPE "construction_contracts"."side" AS ENUM ('client', 'contractor');

-- CreateEnum
CREATE TYPE "construction_contracts"."variation_kind" AS ENUM ('extra_item', 'quantity', 'rate');

-- CreateEnum
CREATE TYPE "construction_contracts"."variation_status" AS ENUM ('pending_approval', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "construction_contracts"."work_order_status" AS ENUM ('draft', 'pending_approval', 'issued', 'closed', 'cancelled');

-- CreateEnum
CREATE TYPE "construction_contracts"."work_order_line_kind" AS ENUM ('boq', 'non_boq');

-- CreateEnum
CREATE TYPE "construction_contracts"."issue_basis" AS ENUM ('free', 'at_cost');

-- CreateEnum
CREATE TYPE "construction_contracts"."measurement_status" AS ENUM ('draft', 'submitted', 'checked');

-- CreateEnum
CREATE TYPE "construction_contracts"."bill_type" AS ENUM ('running', 'escalation');

-- CreateEnum
CREATE TYPE "construction_contracts"."bill_status" AS ENUM ('draft', 'pending_approval', 'approved', 'rejected', 'reversed');

-- CreateEnum
CREATE TYPE "construction_contracts"."deduction_kind" AS ENUM ('retention', 'mobilisation_recovery', 'secured_advance_recovery', 'material_at_cost', 'material_reconciliation', 'other');

-- CreateEnum
CREATE TYPE "construction_contracts"."advance_direction" AS ENUM ('given', 'received');

-- CreateEnum
CREATE TYPE "construction_contracts"."advance_kind" AS ENUM ('mobilisation', 'secured');

-- CreateEnum
CREATE TYPE "construction_contracts"."recovery_mode" AS ENUM ('percent', 'fixed');

-- CreateEnum
CREATE TYPE "construction_contracts"."guarantee_purpose" AS ENUM ('advance', 'retention', 'performance');

-- CreateEnum
CREATE TYPE "construction_contracts"."retention_stage" AS ENUM ('completion', 'dlp_end', 'bank_guarantee', 'other');

-- CreateEnum
CREATE TYPE "construction_contracts"."escalation_component" AS ENUM ('labour', 'material', 'cement', 'steel', 'bitumen', 'pol', 'other');

-- CreateTable
CREATE TABLE "construction_contracts"."settings" (
    "workspace_id" TEXT NOT NULL,
    "deviation_limit_percent" DECIMAL(5,2) NOT NULL DEFAULT 25,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" TEXT NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("workspace_id")
);

-- CreateTable
CREATE TABLE "construction_contracts"."items" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "short_description" TEXT NOT NULL,
    "description" TEXT,
    "uom_id" UUID NOT NULL,
    "sac_hsn" VARCHAR(8),
    "schedule" TEXT,
    "adopted_rate" BIGINT NOT NULL,
    "overhead_percent" DECIMAL(5,2),
    "analysed_rate" BIGINT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_by" TEXT NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "deleted_by" TEXT,

    CONSTRAINT "items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "construction_contracts"."item_analysis_lines" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "item_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "kind" "construction_contracts"."analysis_kind" NOT NULL,
    "material_id" UUID,
    "labour_category_id" UUID,
    "equipment_id" UUID,
    "description" TEXT,
    "coefficient" DECIMAL(14,4) NOT NULL,
    "resource_uom_id" UUID,
    "rate" BIGINT NOT NULL,
    "amount" BIGINT NOT NULL,

    CONSTRAINT "item_analysis_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "construction_contracts"."client_contracts" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "project_id" UUID NOT NULL,
    "retention_percent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "retention_cap_percent" DECIMAL(5,2),
    "retention_completion_percent" DECIMAL(5,2) NOT NULL DEFAULT 50,
    "dlp_months" INTEGER,
    "handover_on" DATE,
    "sac_code" VARCHAR(8),
    "gst_rate" DECIMAL(5,2),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_by" TEXT NOT NULL,

    CONSTRAINT "client_contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "construction_contracts"."boq_sections" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "project_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_by" TEXT NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "deleted_by" TEXT,

    CONSTRAINT "boq_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "construction_contracts"."boq_items" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "project_id" UUID NOT NULL,
    "section_id" UUID NOT NULL,
    "item_id" UUID,
    "item_no" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "uom_id" UUID NOT NULL,
    "sac_hsn" VARCHAR(8),
    "original_quantity" DECIMAL(16,4) NOT NULL,
    "quantity" DECIMAL(16,4) NOT NULL,
    "original_rate" BIGINT NOT NULL,
    "rate" BIGINT NOT NULL,
    "wing_id" UUID,
    "location_id" UUID,
    "position" INTEGER NOT NULL,
    "variation_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_by" TEXT NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "deleted_by" TEXT,

    CONSTRAINT "boq_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "construction_contracts"."variations" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "project_id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "kind" "construction_contracts"."variation_kind" NOT NULL,
    "status" "construction_contracts"."variation_status" NOT NULL,
    "boq_item_id" UUID,
    "section_id" UUID,
    "item_no" TEXT,
    "description" TEXT,
    "uom_id" UUID,
    "sac_hsn" VARCHAR(8),
    "previous_quantity" DECIMAL(16,4),
    "new_quantity" DECIMAL(16,4),
    "previous_rate" BIGINT,
    "new_rate" BIGINT,
    "reason" TEXT NOT NULL,
    "decided_at" TIMESTAMPTZ(3),
    "decided_by" TEXT,
    "reject_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_by" TEXT NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "deleted_by" TEXT,

    CONSTRAINT "variations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "construction_contracts"."work_orders" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "project_id" UUID NOT NULL,
    "contractor_id" UUID NOT NULL,
    "department_id" UUID,
    "number" TEXT NOT NULL,
    "order_date" DATE NOT NULL,
    "valid_until" DATE,
    "scope" TEXT,
    "status" "construction_contracts"."work_order_status" NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "retention_percent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "retention_cap_percent" DECIMAL(5,2),
    "retention_completion_percent" DECIMAL(5,2) NOT NULL DEFAULT 50,
    "dlp_months" INTEGER,
    "tds_nature" TEXT,
    "sac_code" VARCHAR(8),
    "gst_rate" DECIMAL(5,2),
    "reverse_charge" BOOLEAN NOT NULL DEFAULT false,
    "completed_on" DATE,
    "decided_at" TIMESTAMPTZ(3),
    "decided_by" TEXT,
    "reject_reason" TEXT,
    "closed_on" DATE,
    "cancelled_on" DATE,
    "cancel_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_by" TEXT NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "deleted_by" TEXT,

    CONSTRAINT "work_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "construction_contracts"."work_order_revisions" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "work_order_id" UUID NOT NULL,
    "revision" INTEGER NOT NULL,
    "reason" TEXT,
    "snapshot" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,

    CONSTRAINT "work_order_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "construction_contracts"."work_order_lines" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "work_order_id" UUID NOT NULL,
    "kind" "construction_contracts"."work_order_line_kind" NOT NULL,
    "boq_item_id" UUID,
    "item_no" TEXT,
    "description" TEXT NOT NULL,
    "uom_id" UUID NOT NULL,
    "sac_hsn" VARCHAR(8),
    "quantity" DECIMAL(16,4) NOT NULL,
    "rate" BIGINT NOT NULL,
    "position" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(3),
    "deleted_by" TEXT,

    CONSTRAINT "work_order_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "construction_contracts"."work_order_materials" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "work_order_id" UUID NOT NULL,
    "material_id" UUID NOT NULL,
    "issue_basis" "construction_contracts"."issue_basis" NOT NULL,
    "issue_rate" BIGINT,
    "wastage_percent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "penal_rate" BIGINT,

    CONSTRAINT "work_order_materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "construction_contracts"."work_order_material_coefficients" (
    "work_order_material_id" UUID NOT NULL,
    "work_order_line_id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "coefficient" DECIMAL(14,4) NOT NULL,

    CONSTRAINT "work_order_material_coefficients_pkey" PRIMARY KEY ("work_order_material_id","work_order_line_id")
);

-- CreateTable
CREATE TABLE "construction_contracts"."measurement_sheets" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "project_id" UUID NOT NULL,
    "side" "construction_contracts"."side" NOT NULL,
    "work_order_id" UUID,
    "measured_on" DATE NOT NULL,
    "status" "construction_contracts"."measurement_status" NOT NULL,
    "title" TEXT,
    "remarks" TEXT,
    "submitted_at" TIMESTAMPTZ(3),
    "submitted_by" TEXT,
    "checked_at" TIMESTAMPTZ(3),
    "checked_by" TEXT,
    "party_name" TEXT,
    "party_role" TEXT,
    "joint_on" DATE,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_by" TEXT NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "deleted_by" TEXT,

    CONSTRAINT "measurement_sheets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "construction_contracts"."measurement_rows" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "sheet_id" UUID NOT NULL,
    "boq_item_id" UUID,
    "work_order_line_id" UUID,
    "description" TEXT,
    "location_type" TEXT,
    "location" JSONB,
    "nos" DECIMAL(16,4),
    "length" DECIMAL(16,4),
    "breadth" DECIMAL(16,4),
    "depth" DECIMAL(16,4),
    "direct" BOOLEAN NOT NULL DEFAULT false,
    "quantity" DECIMAL(16,4) NOT NULL,
    "position" INTEGER NOT NULL,
    "bill_id" UUID,

    CONSTRAINT "measurement_rows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "construction_contracts"."bills" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "project_id" UUID NOT NULL,
    "side" "construction_contracts"."side" NOT NULL,
    "type" "construction_contracts"."bill_type" NOT NULL,
    "work_order_id" UUID,
    "client_id" UUID,
    "number" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "bill_date" DATE NOT NULL,
    "measured_up_to" DATE,
    "period_from" DATE,
    "period_to" DATE,
    "is_final" BOOLEAN NOT NULL DEFAULT false,
    "status" "construction_contracts"."bill_status" NOT NULL,
    "cumulative_value" BIGINT NOT NULL DEFAULT 0,
    "previous_value" BIGINT NOT NULL DEFAULT 0,
    "gross" BIGINT NOT NULL DEFAULT 0,
    "sac_code" VARCHAR(8),
    "gst_rate" DECIMAL(5,2),
    "place_of_supply_state_code" CHAR(2),
    "supplier_gstin" VARCHAR(15),
    "recipient_gstin" VARCHAR(15),
    "reverse_charge" BOOLEAN NOT NULL DEFAULT false,
    "cgst" BIGINT NOT NULL DEFAULT 0,
    "sgst" BIGINT NOT NULL DEFAULT 0,
    "igst" BIGINT NOT NULL DEFAULT 0,
    "deductions_total" BIGINT NOT NULL DEFAULT 0,
    "net" BIGINT NOT NULL DEFAULT 0,
    "working" JSONB,
    "remarks" TEXT,
    "invoice_id" UUID,
    "submitted_at" TIMESTAMPTZ(3),
    "submitted_by" TEXT,
    "decided_at" TIMESTAMPTZ(3),
    "decided_by" TEXT,
    "reject_reason" TEXT,
    "reversed_at" TIMESTAMPTZ(3),
    "reversed_by" TEXT,
    "reverse_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_by" TEXT NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "deleted_by" TEXT,

    CONSTRAINT "bills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "construction_contracts"."bill_lines" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "bill_id" UUID NOT NULL,
    "boq_item_id" UUID,
    "work_order_line_id" UUID,
    "item_no" TEXT,
    "description" TEXT NOT NULL,
    "uom_id" UUID NOT NULL,
    "rate" BIGINT NOT NULL,
    "cumulative_quantity" DECIMAL(16,4) NOT NULL,
    "previous_quantity" DECIMAL(16,4) NOT NULL,
    "quantity" DECIMAL(16,4) NOT NULL,
    "amount" BIGINT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "bill_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "construction_contracts"."bill_deductions" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "bill_id" UUID NOT NULL,
    "kind" "construction_contracts"."deduction_kind" NOT NULL,
    "description" TEXT,
    "amount" BIGINT NOT NULL,
    "advance_id" UUID,
    "position" INTEGER NOT NULL,

    CONSTRAINT "bill_deductions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "construction_contracts"."advances" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "project_id" UUID NOT NULL,
    "direction" "construction_contracts"."advance_direction" NOT NULL,
    "kind" "construction_contracts"."advance_kind" NOT NULL,
    "work_order_id" UUID,
    "client_id" UUID,
    "amount" BIGINT NOT NULL,
    "advance_on" DATE NOT NULL,
    "recovery_mode" "construction_contracts"."recovery_mode" NOT NULL,
    "recovery_value" DECIMAL(16,4) NOT NULL,
    "payment_id" UUID,
    "remarks" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_by" TEXT NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "deleted_by" TEXT,

    CONSTRAINT "advances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "construction_contracts"."bank_guarantees" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "project_id" UUID NOT NULL,
    "side" "construction_contracts"."side" NOT NULL,
    "purpose" "construction_contracts"."guarantee_purpose" NOT NULL,
    "work_order_id" UUID,
    "advance_id" UUID,
    "number" TEXT NOT NULL,
    "bank" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "issued_on" DATE,
    "expires_on" DATE NOT NULL,
    "released_on" DATE,
    "remarks" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_by" TEXT NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "deleted_by" TEXT,

    CONSTRAINT "bank_guarantees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "construction_contracts"."retention_releases" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "project_id" UUID NOT NULL,
    "side" "construction_contracts"."side" NOT NULL,
    "work_order_id" UUID,
    "stage" "construction_contracts"."retention_stage" NOT NULL,
    "amount" BIGINT NOT NULL,
    "released_on" DATE NOT NULL,
    "reason" TEXT,
    "bank_guarantee_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "deleted_by" TEXT,

    CONSTRAINT "retention_releases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "construction_contracts"."price_indices" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "series" TEXT NOT NULL,
    "month" DATE NOT NULL,
    "value" DECIMAL(12,4) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_by" TEXT NOT NULL,

    CONSTRAINT "price_indices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "construction_contracts"."escalation_clauses" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "project_id" UUID NOT NULL,
    "side" "construction_contracts"."side" NOT NULL,
    "work_order_id" UUID,
    "base_month" DATE NOT NULL,
    "non_escalable_percent" DECIMAL(5,2) NOT NULL DEFAULT 15,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_by" TEXT NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "deleted_by" TEXT,

    CONSTRAINT "escalation_clauses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "construction_contracts"."escalation_clause_components" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "clause_id" UUID NOT NULL,
    "component" "construction_contracts"."escalation_component" NOT NULL,
    "weight_percent" DECIMAL(5,2) NOT NULL,
    "series" TEXT NOT NULL,

    CONSTRAINT "escalation_clause_components_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "items_workspace_id_code_idx" ON "construction_contracts"."items"("workspace_id", "code");

-- CreateIndex
CREATE INDEX "items_workspace_id_schedule_idx" ON "construction_contracts"."items"("workspace_id", "schedule");

-- CreateIndex
CREATE INDEX "item_analysis_lines_item_id_position_idx" ON "construction_contracts"."item_analysis_lines"("item_id", "position");

-- CreateIndex
CREATE INDEX "item_analysis_lines_workspace_id_material_id_idx" ON "construction_contracts"."item_analysis_lines"("workspace_id", "material_id");

-- CreateIndex
CREATE UNIQUE INDEX "client_contracts_project_id_key" ON "construction_contracts"."client_contracts"("project_id");

-- CreateIndex
CREATE INDEX "client_contracts_workspace_id_idx" ON "construction_contracts"."client_contracts"("workspace_id");

-- CreateIndex
CREATE INDEX "boq_sections_workspace_id_project_id_position_idx" ON "construction_contracts"."boq_sections"("workspace_id", "project_id", "position");

-- CreateIndex
CREATE INDEX "boq_items_workspace_id_project_id_section_id_position_idx" ON "construction_contracts"."boq_items"("workspace_id", "project_id", "section_id", "position");

-- CreateIndex
CREATE INDEX "boq_items_workspace_id_item_id_idx" ON "construction_contracts"."boq_items"("workspace_id", "item_id");

-- CreateIndex
CREATE INDEX "variations_workspace_id_project_id_created_at_idx" ON "construction_contracts"."variations"("workspace_id", "project_id", "created_at");

-- CreateIndex
CREATE INDEX "variations_workspace_id_boq_item_id_idx" ON "construction_contracts"."variations"("workspace_id", "boq_item_id");

-- CreateIndex
CREATE INDEX "work_orders_workspace_id_project_id_created_at_idx" ON "construction_contracts"."work_orders"("workspace_id", "project_id", "created_at");

-- CreateIndex
CREATE INDEX "work_orders_workspace_id_contractor_id_idx" ON "construction_contracts"."work_orders"("workspace_id", "contractor_id");

-- CreateIndex
CREATE INDEX "work_orders_workspace_id_project_id_status_idx" ON "construction_contracts"."work_orders"("workspace_id", "project_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "work_order_revisions_work_order_id_revision_key" ON "construction_contracts"."work_order_revisions"("work_order_id", "revision");

-- CreateIndex
CREATE INDEX "work_order_lines_work_order_id_position_idx" ON "construction_contracts"."work_order_lines"("work_order_id", "position");

-- CreateIndex
CREATE INDEX "work_order_lines_workspace_id_boq_item_id_idx" ON "construction_contracts"."work_order_lines"("workspace_id", "boq_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "work_order_materials_work_order_id_material_id_key" ON "construction_contracts"."work_order_materials"("work_order_id", "material_id");

-- CreateIndex
CREATE INDEX "work_order_material_coefficients_work_order_line_id_idx" ON "construction_contracts"."work_order_material_coefficients"("work_order_line_id");

-- CreateIndex
CREATE INDEX "measurement_sheets_workspace_id_project_id_side_measured_on_idx" ON "construction_contracts"."measurement_sheets"("workspace_id", "project_id", "side", "measured_on");

-- CreateIndex
CREATE INDEX "measurement_sheets_workspace_id_work_order_id_idx" ON "construction_contracts"."measurement_sheets"("workspace_id", "work_order_id");

-- CreateIndex
CREATE INDEX "measurement_rows_sheet_id_position_idx" ON "construction_contracts"."measurement_rows"("sheet_id", "position");

-- CreateIndex
CREATE INDEX "measurement_rows_workspace_id_boq_item_id_idx" ON "construction_contracts"."measurement_rows"("workspace_id", "boq_item_id");

-- CreateIndex
CREATE INDEX "measurement_rows_workspace_id_work_order_line_id_idx" ON "construction_contracts"."measurement_rows"("workspace_id", "work_order_line_id");

-- CreateIndex
CREATE INDEX "measurement_rows_bill_id_idx" ON "construction_contracts"."measurement_rows"("bill_id");

-- CreateIndex
CREATE INDEX "bills_workspace_id_project_id_side_bill_date_idx" ON "construction_contracts"."bills"("workspace_id", "project_id", "side", "bill_date");

-- CreateIndex
CREATE INDEX "bills_workspace_id_work_order_id_idx" ON "construction_contracts"."bills"("workspace_id", "work_order_id");

-- CreateIndex
CREATE INDEX "bills_workspace_id_client_id_idx" ON "construction_contracts"."bills"("workspace_id", "client_id");

-- CreateIndex
CREATE INDEX "bills_workspace_id_project_id_status_idx" ON "construction_contracts"."bills"("workspace_id", "project_id", "status");

-- CreateIndex
CREATE INDEX "bill_lines_bill_id_position_idx" ON "construction_contracts"."bill_lines"("bill_id", "position");

-- CreateIndex
CREATE INDEX "bill_lines_workspace_id_boq_item_id_idx" ON "construction_contracts"."bill_lines"("workspace_id", "boq_item_id");

-- CreateIndex
CREATE INDEX "bill_lines_workspace_id_work_order_line_id_idx" ON "construction_contracts"."bill_lines"("workspace_id", "work_order_line_id");

-- CreateIndex
CREATE INDEX "bill_deductions_bill_id_position_idx" ON "construction_contracts"."bill_deductions"("bill_id", "position");

-- CreateIndex
CREATE INDEX "bill_deductions_workspace_id_advance_id_idx" ON "construction_contracts"."bill_deductions"("workspace_id", "advance_id");

-- CreateIndex
CREATE INDEX "advances_workspace_id_project_id_idx" ON "construction_contracts"."advances"("workspace_id", "project_id");

-- CreateIndex
CREATE INDEX "advances_workspace_id_work_order_id_idx" ON "construction_contracts"."advances"("workspace_id", "work_order_id");

-- CreateIndex
CREATE INDEX "bank_guarantees_workspace_id_expires_on_idx" ON "construction_contracts"."bank_guarantees"("workspace_id", "expires_on");

-- CreateIndex
CREATE INDEX "bank_guarantees_workspace_id_project_id_idx" ON "construction_contracts"."bank_guarantees"("workspace_id", "project_id");

-- CreateIndex
CREATE INDEX "retention_releases_workspace_id_project_id_side_idx" ON "construction_contracts"."retention_releases"("workspace_id", "project_id", "side");

-- CreateIndex
CREATE INDEX "retention_releases_workspace_id_work_order_id_idx" ON "construction_contracts"."retention_releases"("workspace_id", "work_order_id");

-- CreateIndex
CREATE UNIQUE INDEX "price_indices_workspace_id_series_month_key" ON "construction_contracts"."price_indices"("workspace_id", "series", "month");

-- CreateIndex
CREATE INDEX "escalation_clauses_workspace_id_project_id_idx" ON "construction_contracts"."escalation_clauses"("workspace_id", "project_id");

-- CreateIndex
CREATE INDEX "escalation_clauses_workspace_id_work_order_id_idx" ON "construction_contracts"."escalation_clauses"("workspace_id", "work_order_id");

-- CreateIndex
CREATE UNIQUE INDEX "escalation_clause_components_clause_id_component_key" ON "construction_contracts"."escalation_clause_components"("clause_id", "component");

-- AddForeignKey
ALTER TABLE "construction_contracts"."item_analysis_lines" ADD CONSTRAINT "item_analysis_lines_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "construction_contracts"."items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "construction_contracts"."boq_items" ADD CONSTRAINT "boq_items_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "construction_contracts"."boq_sections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "construction_contracts"."work_order_revisions" ADD CONSTRAINT "work_order_revisions_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "construction_contracts"."work_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "construction_contracts"."work_order_lines" ADD CONSTRAINT "work_order_lines_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "construction_contracts"."work_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "construction_contracts"."work_order_materials" ADD CONSTRAINT "work_order_materials_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "construction_contracts"."work_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "construction_contracts"."work_order_material_coefficients" ADD CONSTRAINT "work_order_material_coefficients_work_order_material_id_fkey" FOREIGN KEY ("work_order_material_id") REFERENCES "construction_contracts"."work_order_materials"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "construction_contracts"."work_order_material_coefficients" ADD CONSTRAINT "work_order_material_coefficients_work_order_line_id_fkey" FOREIGN KEY ("work_order_line_id") REFERENCES "construction_contracts"."work_order_lines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "construction_contracts"."measurement_rows" ADD CONSTRAINT "measurement_rows_sheet_id_fkey" FOREIGN KEY ("sheet_id") REFERENCES "construction_contracts"."measurement_sheets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "construction_contracts"."bill_lines" ADD CONSTRAINT "bill_lines_bill_id_fkey" FOREIGN KEY ("bill_id") REFERENCES "construction_contracts"."bills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "construction_contracts"."bill_deductions" ADD CONSTRAINT "bill_deductions_bill_id_fkey" FOREIGN KEY ("bill_id") REFERENCES "construction_contracts"."bills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "construction_contracts"."escalation_clause_components" ADD CONSTRAINT "escalation_clause_components_clause_id_fkey" FOREIGN KEY ("clause_id") REFERENCES "construction_contracts"."escalation_clauses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Item codes are unique in a Company among live rows, ignoring case (CM-0023 §3).
CREATE UNIQUE INDEX "items_workspace_code_live_key" ON "construction_contracts"."items"("workspace_id", lower("code")) WHERE "deleted_at" IS NULL;

-- Section titles and BOQ item numbers are unique in a Project among live rows, ignoring case (CM-0023 §4).
CREATE UNIQUE INDEX "boq_sections_project_title_live_key" ON "construction_contracts"."boq_sections"("project_id", lower("title")) WHERE "deleted_at" IS NULL;
CREATE UNIQUE INDEX "boq_items_project_item_no_live_key" ON "construction_contracts"."boq_items"("project_id", lower("item_no")) WHERE "deleted_at" IS NULL;

-- Document numbers come from sequence rules and are unique in a Company among live rows.
CREATE UNIQUE INDEX "variations_workspace_number_live_key" ON "construction_contracts"."variations"("workspace_id", "number") WHERE "deleted_at" IS NULL;
CREATE UNIQUE INDEX "work_orders_workspace_number_live_key" ON "construction_contracts"."work_orders"("workspace_id", "number") WHERE "deleted_at" IS NULL;
CREATE UNIQUE INDEX "bills_workspace_side_number_live_key" ON "construction_contracts"."bills"("workspace_id", "side", "number") WHERE "deleted_at" IS NULL;

-- One open (draft or pending) RA bill at a time per Work Order, and per
-- Project on the client side, so two drafts never take the same
-- measurements (CM-0023 §7). Escalation bills are not limited.
CREATE UNIQUE INDEX "bills_one_open_per_work_order" ON "construction_contracts"."bills"("work_order_id") WHERE "deleted_at" IS NULL AND "type" = 'running' AND "status" IN ('draft', 'pending_approval') AND "work_order_id" IS NOT NULL;
CREATE UNIQUE INDEX "bills_one_open_client_per_project" ON "construction_contracts"."bills"("project_id") WHERE "deleted_at" IS NULL AND "type" = 'running' AND "side" = 'client' AND "status" IN ('draft', 'pending_approval');

-- A bill's ordinal is unique on its Work Order, or on the Project's client side, among bills that count.
CREATE UNIQUE INDEX "bills_work_order_ordinal_key" ON "construction_contracts"."bills"("work_order_id", "type", "ordinal") WHERE "deleted_at" IS NULL AND "status" NOT IN ('rejected', 'reversed') AND "work_order_id" IS NOT NULL;
CREATE UNIQUE INDEX "bills_client_ordinal_key" ON "construction_contracts"."bills"("project_id", "type", "ordinal") WHERE "deleted_at" IS NULL AND "status" NOT IN ('rejected', 'reversed') AND "side" = 'client';

-- One escalation clause per Work Order, and one for the client contract.
CREATE UNIQUE INDEX "escalation_clauses_work_order_live_key" ON "construction_contracts"."escalation_clauses"("work_order_id") WHERE "deleted_at" IS NULL AND "work_order_id" IS NOT NULL;
CREATE UNIQUE INDEX "escalation_clauses_client_live_key" ON "construction_contracts"."escalation_clauses"("project_id") WHERE "deleted_at" IS NULL AND "side" = 'client';
