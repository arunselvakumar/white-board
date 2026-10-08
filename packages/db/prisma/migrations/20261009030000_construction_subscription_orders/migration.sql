-- Plans, checkout and invoices (CM-116, CM-117): add-ons and the paid value
-- on the subscription, immutable orders, and the invoice number counter.
-- AlterTable
ALTER TABLE "construction_organization"."subscriptions" ADD COLUMN "add_ons" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN "paid_value" INTEGER NOT NULL DEFAULT 0;

-- CreateEnum
CREATE TYPE "construction_organization"."subscription_order_kind" AS ENUM ('new', 'extend', 'upgrade', 'add_ons');

-- CreateEnum
CREATE TYPE "construction_organization"."subscription_order_status" AS ENUM ('created', 'paid', 'failed');

-- CreateTable
CREATE TABLE "construction_organization"."subscription_orders" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "kind" "construction_organization"."subscription_order_kind" NOT NULL,
    "plan_code" TEXT NOT NULL,
    "plan_name" TEXT NOT NULL,
    "months" INTEGER,
    "days" INTEGER,
    "add_ons" JSONB NOT NULL,
    "lines" JSONB NOT NULL,
    "catalogue_version" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'INR',
    "sub_total" INTEGER NOT NULL,
    "last_plan_discount" INTEGER NOT NULL,
    "taxable_amount" INTEGER NOT NULL,
    "cgst" INTEGER NOT NULL,
    "sgst" INTEGER NOT NULL,
    "igst" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3) NOT NULL,
    "billing_name" TEXT NOT NULL,
    "billing_address" TEXT NOT NULL,
    "billing_state_code" CHAR(2) NOT NULL,
    "billing_gstin" VARCHAR(15),
    "seller" JSONB NOT NULL,
    "gateway" TEXT NOT NULL DEFAULT 'razorpay',
    "gateway_order_id" TEXT NOT NULL,
    "gateway_payment_id" TEXT,
    "status" "construction_organization"."subscription_order_status" NOT NULL DEFAULT 'created',
    "invoice_number" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paid_at" TIMESTAMPTZ(3),
    "failed_at" TIMESTAMPTZ(3),

    CONSTRAINT "subscription_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "construction_organization"."subscription_invoice_counters" (
    "fiscal_year" TEXT NOT NULL,
    "last_number" INTEGER NOT NULL,

    CONSTRAINT "subscription_invoice_counters_pkey" PRIMARY KEY ("fiscal_year")
);

-- CreateIndex
CREATE UNIQUE INDEX "subscription_orders_gateway_order_id_key" ON "construction_organization"."subscription_orders"("gateway_order_id");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_orders_invoice_number_key" ON "construction_organization"."subscription_orders"("invoice_number");

-- CreateIndex
CREATE INDEX "subscription_orders_workspace_id_created_at_idx" ON "construction_organization"."subscription_orders"("workspace_id", "created_at");

-- CreateIndex
CREATE INDEX "subscription_orders_workspace_id_paid_at_idx" ON "construction_organization"."subscription_orders"("workspace_id", "paid_at");
