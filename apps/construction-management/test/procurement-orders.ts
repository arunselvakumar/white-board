import { randomUUID } from "node:crypto";

import { Prisma, prisma } from "@repo/construction-db";

import type { StockLocation } from "@/src/procurement/domain/stock-location";
import { lineAmounts, type SupplyType } from "@/src/shared-kernel/gst-line";

// Purchase Orders written straight to `construction_procurement` for GRN
// tests (CM-505), so they do not depend on the PO routes (CM-504).

export type OrderLineFixture = {
  materialId: string;
  materialName?: string;
  uomId: string;
  uomName?: string;
  /** Decimal string. */
  quantity: string;
  /** Paise per unit. */
  unitRate: bigint;
  discountPercent?: string;
  gstRate?: string;
  hsnCode?: string | null;
};

export type OrderFixture = {
  location: StockLocation;
  supplierId: string;
  supplierName?: string;
  lines: readonly OrderLineFixture[];
  approvalStatus?: "pending" | "approved" | "rejected";
  ordered?: boolean;
  closed?: boolean;
  supplyType?: SupplyType;
  number?: string;
};

/**
 * An approved and ordered PO (unless told otherwise) with its lines, the
 * line math done by the kernel. Returns the PO id and its line ids in
 * order.
 */
export async function addPurchaseOrder(
  workspaceId: string,
  by: string,
  fixture: OrderFixture,
): Promise<{ id: string; number: string; lineIds: string[] }> {
  const id = randomUUID();
  const now = new Date();
  const supplyType = fixture.supplyType ?? "intra_state";
  const number = fixture.number ?? `PO/${randomUUID().slice(0, 8)}`;
  const approved = (fixture.approvalStatus ?? "approved") === "approved";
  const lines = fixture.lines.map((line, index) => {
    const amounts = lineAmounts(
      {
        quantity: line.quantity,
        unitRate: line.unitRate,
        discount:
          line.discountPercent == null
            ? null
            : { type: "percent", percent: line.discountPercent },
        gstRate: line.gstRate ?? "18",
      },
      supplyType,
    );
    return {
      id: randomUUID(),
      position: index + 1,
      materialId: line.materialId,
      materialName: line.materialName ?? "Cement OPC 53",
      uomId: line.uomId,
      uomName: line.uomName ?? "Bag",
      hsnCode: line.hsnCode === undefined ? "2523" : line.hsnCode,
      quantity: new Prisma.Decimal(line.quantity),
      unitRate: line.unitRate,
      discountType: line.discountPercent == null ? null : ("percent" as const),
      discountPercent:
        line.discountPercent == null
          ? null
          : new Prisma.Decimal(line.discountPercent),
      discountAmount: amounts.discountAmount,
      gstRate: new Prisma.Decimal(line.gstRate ?? "18"),
      subTotal: amounts.subTotal,
      taxable: amounts.taxable,
      cgst: amounts.cgst,
      sgst: amounts.sgst,
      igst: amounts.igst,
      total: amounts.total,
    };
  });
  const sum = (pick: (line: (typeof lines)[number]) => bigint) =>
    lines.reduce((total, line) => total + pick(line), 0n);
  await prisma.constructionProcurementPurchaseOrder.create({
    data: {
      id,
      workspaceId,
      locationKind: fixture.location.kind,
      locationId: fixture.location.id,
      number,
      orderDate: new Date("2026-09-01T00:00:00.000Z"),
      expectedDeliveryDate: new Date("2026-09-15T00:00:00.000Z"),
      supplierId: fixture.supplierId,
      supplierName: fixture.supplierName ?? "Sri Murugan Traders",
      supplyType,
      billingAddressId: randomUUID(),
      billingName: "Head office",
      billingAddress: "12, Anna Salai, Chennai 600002",
      billingStateCode: "33",
      subTotal: sum((line) => line.subTotal),
      discountTotal: sum((line) => line.discountAmount),
      taxableTotal: sum((line) => line.taxable),
      cgstTotal: sum((line) => line.cgst),
      sgstTotal: sum((line) => line.sgst),
      igstTotal: sum((line) => line.igst),
      itemsTotal: sum((line) => line.total),
      grandTotal: sum((line) => line.total),
      approvalStatus: fixture.approvalStatus ?? "approved",
      decidedAt: approved ? now : null,
      decidedBy: approved ? by : null,
      orderedAt: approved && fixture.ordered !== false ? now : null,
      orderedBy: approved && fixture.ordered !== false ? by : null,
      closedAt: fixture.closed === true ? now : null,
      closedBy: fixture.closed === true ? by : null,
      closeReason: fixture.closed === true ? "Short supplied" : null,
      createdAt: now,
      updatedAt: now,
      createdBy: by,
      updatedBy: by,
      items: { create: lines },
    },
  });
  return { id, number, lineIds: lines.map((line) => line.id) };
}

/** The PO's receipt status and received quantity per line, in line order. */
export async function orderReceipt(id: string) {
  const order =
    await prisma.constructionProcurementPurchaseOrder.findUniqueOrThrow({
      where: { id },
      include: { items: { orderBy: { position: "asc" } } },
    });
  return {
    receiptStatus: order.receiptStatus,
    received: order.items.map((item) => item.receivedQty.toFixed(3)),
  };
}
