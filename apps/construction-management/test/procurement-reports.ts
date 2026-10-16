import { randomUUID } from "node:crypto";

import { Prisma, prisma } from "@repo/construction-db";

import type { StockLocation } from "@/src/procurement/domain/stock-location";
import { PrismaStockLedger } from "@/src/procurement/infrastructure/prisma-stock-ledger";

/**
 * Procurement documents for the procurement report tests (CM-903),
 * written straight to `construction_procurement`: the reports are
 * read-side, so these rows only need what a report prints.
 */

type Approval = "pending" | "approved" | "rejected";

function stamp(by: string) {
  const now = new Date();
  return { createdAt: now, updatedAt: now, createdBy: by, updatedBy: by };
}

const day = (date: string) => new Date(`${date}T00:00:00.000Z`);

export type ReportLine = {
  materialId: string;
  materialName: string;
  uomId: string;
  uomName?: string;
  categoryId?: string | null;
  quantity: string;
  /** Paise per unit (receipts). */
  unitRate?: bigint;
};

/** A Purchase Request of the Project with its lines. */
export async function reportPurchaseRequest(
  workspaceId: string,
  by: string,
  input: {
    projectId: string;
    requestDate: string;
    lines: readonly ReportLine[];
    approvalStatus?: Approval;
    requiredDate?: string;
    deleted?: boolean;
  },
): Promise<{ id: string; number: string }> {
  const id = randomUUID();
  const number = `PR/T/${id.slice(0, 8)}`;
  const decided = (input.approvalStatus ?? "pending") !== "pending";
  await prisma.constructionProcurementPurchaseRequest.create({
    data: {
      id,
      workspaceId,
      projectId: input.projectId,
      number,
      requestDate: day(input.requestDate),
      requiredDate: input.requiredDate == null ? null : day(input.requiredDate),
      approvalStatus: input.approvalStatus ?? "pending",
      decidedAt: decided ? new Date() : null,
      decidedBy: decided ? by : null,
      commonRemark: "Needed for the slab",
      ...stamp(by),
      ...(input.deleted === true
        ? { deletedAt: new Date(), deletedBy: by }
        : {}),
      items: {
        create: input.lines.map((line, index) => ({
          id: randomUUID(),
          position: index + 1,
          materialId: line.materialId,
          materialName: line.materialName,
          categoryId: line.categoryId ?? null,
          uomId: line.uomId,
          uomName: line.uomName ?? "Bag",
          quantity: new Prisma.Decimal(line.quantity),
        })),
      },
    },
  });
  return { id, number };
}

/** A Goods Received Note at the location, its lines at 18% GST within the state. */
export async function reportGoodsReceipt(
  workspaceId: string,
  by: string,
  input: {
    location: StockLocation;
    supplierId: string;
    supplierName: string;
    receiptDate: string;
    lines: readonly ReportLine[];
    invoiceNo?: string;
  },
): Promise<{ id: string; number: string }> {
  const id = randomUUID();
  const number = `GRN/T/${id.slice(0, 8)}`;
  const lines = input.lines.map((line, index) => {
    const rate = line.unitRate ?? 10_000n;
    const taxable = BigInt(
      new Prisma.Decimal(line.quantity).mul(rate.toString()).toFixed(0),
    );
    const half = (taxable * 9n) / 100n;
    return {
      id: randomUUID(),
      position: index + 1,
      materialId: line.materialId,
      materialName: line.materialName,
      uomId: line.uomId,
      uomName: line.uomName ?? "Bag",
      receivedQty: new Prisma.Decimal(line.quantity),
      unitRate: rate,
      gstRate: new Prisma.Decimal("18"),
      taxable,
      cgst: half,
      sgst: half,
      total: taxable + half + half,
    };
  });
  const sum = (pick: (line: (typeof lines)[number]) => bigint) =>
    lines.reduce((total, line) => total + pick(line), 0n);
  await prisma.constructionProcurementGoodsReceipt.create({
    data: {
      id,
      workspaceId,
      locationKind: input.location.kind,
      locationId: input.location.id,
      number,
      receiptDate: day(input.receiptDate),
      inventoryDate: day(input.receiptDate),
      supplierId: input.supplierId,
      supplierName: input.supplierName,
      invoiceNo: input.invoiceNo ?? "INV-77",
      invoiceAmount: sum((line) => line.total),
      vehicleNo: "TN 09 AB 1234",
      taxableTotal: sum((line) => line.taxable),
      cgstTotal: sum((line) => line.cgst),
      sgstTotal: sum((line) => line.sgst),
      totalValue: sum((line) => line.total),
      ...stamp(by),
      items: { create: lines },
    },
  });
  return { id, number };
}

/** A Material Transfer between two places with its lines. */
export async function reportTransfer(
  workspaceId: string,
  by: string,
  input: {
    from: StockLocation;
    to: StockLocation;
    transferDate: string;
    lines: readonly ReportLine[];
    approvalStatus?: Approval;
    deliveredOn?: string;
    receiverName?: string;
  },
): Promise<{ id: string; number: string }> {
  const id = randomUUID();
  const number = `MT/T/${id.slice(0, 8)}`;
  await prisma.constructionProcurementMaterialTransfer.create({
    data: {
      id,
      workspaceId,
      number,
      transferDate: day(input.transferDate),
      fromKind: input.from.kind,
      fromId: input.from.id,
      toKind: input.to.kind,
      toId: input.to.id,
      receiverName: input.receiverName ?? null,
      remark: "Excess after the slab",
      approvalStatus: input.approvalStatus ?? "pending",
      deliveredOn: input.deliveredOn == null ? null : day(input.deliveredOn),
      deliveredAt: input.deliveredOn == null ? null : new Date(),
      deliveredBy: input.deliveredOn == null ? null : by,
      ...stamp(by),
      items: {
        create: input.lines.map((line, index) => ({
          id: randomUUID(),
          position: index + 1,
          materialId: line.materialId,
          materialName: line.materialName,
          uomId: line.uomId,
          uomName: line.uomName ?? "Bag",
          quantity: new Prisma.Decimal(line.quantity),
        })),
      },
    },
  });
  return { id, number };
}

/** A consumption posted to the stock ledger, as a Consumed movement would. */
export async function reportConsumption(
  workspaceId: string,
  by: string,
  location: StockLocation,
  materialId: string,
  quantity: string,
  entryDate: string,
): Promise<void> {
  const movementId = randomUUID();
  await prisma.$transaction(async (tx) => {
    await tx.constructionProcurementStockMovement.create({
      data: {
        id: movementId,
        workspaceId,
        locationKind: location.kind,
        locationId: location.id,
        kind: "consumed",
        movementDate: day(entryDate),
        materialId,
        quantity: new Prisma.Decimal(quantity),
        ...stamp(by),
      },
    });
    await new PrismaStockLedger().post(tx, { workspaceId, by }, [
      {
        location,
        materialId,
        entryDate,
        type: "consumed",
        quantity,
        source: { type: "stock_movement", id: movementId },
      },
    ]);
  });
}
