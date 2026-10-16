import { describe, expect, it } from "vitest";

import {
  buildMaterialReceivedReport,
  buildMaterialTransferReport,
  buildPurchaseOrderReport,
  buildPurchaseRequestReport,
  buildStockRegisterReport,
  type MaterialReceivedReportRow,
  type ProcurementReportScope,
  type PurchaseOrderReportRow,
  type PurchaseRequestReportRow,
} from "./procurement-reports";
import type { ReportTable } from "./report-document";

const PROJECT: ProcurementReportScope = {
  central: false,
  covers: null,
  filters: [],
};
const CENTRAL: ProcurementReportScope = {
  central: true,
  covers: "the Projects you are on and every Central Store",
  filters: ["Supplier: Sri Murugan Traders"],
};

function labels(table: ReportTable | undefined): string[] {
  return (table?.columns ?? []).map((column) => column.label);
}

function cell(table: ReportTable | undefined, row: number, label: string) {
  const index = labels(table).indexOf(label);
  return table?.rows[row]?.[index];
}

function request(
  overrides: Partial<PurchaseRequestReportRow> = {},
): PurchaseRequestReportRow {
  return {
    number: "PR/26-27/00002",
    requestDate: "2026-10-02",
    project: "Tower A",
    material: "Cement OPC 53",
    category: "Cement",
    quantity: 120,
    orderedQty: 40.5,
    uom: "Bag",
    requiredBy: "2026-10-10",
    location: "Wing A / Floor 2",
    status: "Approved",
    orderStatus: "Partially ordered",
    createdBy: "Prabhu Saravanan",
    decidedBy: "Arun Selva Kumar",
    remark: null,
    ...overrides,
  };
}

describe("Purchase Request report (CM-903)", () => {
  it("prints one row per material, in Request Date order, and counts requests by status", () => {
    const body = buildPurchaseRequestReport({
      rows: [
        request(),
        request({ material: "River sand", uom: "Cft", quantity: 300 }),
        request({
          number: "PR/26-27/00001",
          requestDate: "2026-10-01",
          status: "Pending",
          orderStatus: "Not ordered",
          orderedQty: 0,
        }),
      ],
      scope: PROJECT,
    });
    const [lines, byStatus] = body.tables;
    expect(labels(lines)).not.toContain("Project");
    expect(labels(lines)).toEqual(
      expect.arrayContaining([
        "PR No.",
        "Request Date",
        "Material",
        "Quantity",
        "Ordered",
        "Required By",
        "Status",
        "Order Status",
        "Created By",
        "Decided By",
      ]),
    );
    expect(cell(lines, 0, "PR No.")).toBe("PR/26-27/00001");
    expect(cell(lines, 0, "Request Date")).toBe("01 Oct 2026");
    expect(cell(lines, 1, "Ordered")).toBe(40.5);
    expect(lines?.totals?.[1]).toBe("2 requests");
    expect(byStatus?.rows).toEqual([
      ["Pending", 1],
      ["Approved", 1],
      ["Rejected", 0],
    ]);
  });

  it("adds the Project column and the coverage note centrally", () => {
    const body = buildPurchaseRequestReport({
      rows: [request()],
      scope: CENTRAL,
    });
    expect(cell(body.tables[0], 0, "Project")).toBe("Tower A");
    expect(body.notes).toContain(
      "Covers the Projects you are on and every Central Store.",
    );
    expect(body.notes).toContain("Filtered by Supplier: Sri Murugan Traders.");
  });
});

function order(
  overrides: Partial<PurchaseOrderReportRow> = {},
): PurchaseOrderReportRow {
  return {
    number: "PO/26-27/00001",
    orderDate: "2026-10-03",
    place: "Central Store Ambattur",
    supplier: "Sri Murugan Traders",
    purchaseRequest: "PR/26-27/00002",
    expectedDelivery: "2026-10-12",
    status: "Approved",
    receiptStatus: "Partially received",
    taxable: 1_000_000,
    cgst: 90_000,
    sgst: 90_000,
    igst: 0,
    grandTotal: 1_180_000,
    lines: [
      {
        material: "Cement OPC 53",
        uom: "Bag",
        ordered: 100,
        received: 60,
        unitRate: 10_000,
        gstRate: 18,
        total: 1_180_000,
      },
    ],
    ...overrides,
  };
}

describe("Purchase Order report (CM-903)", () => {
  it("prints value with GST, lines ordered and received, and sums the money", () => {
    const body = buildPurchaseOrderReport({
      rows: [order(), order({ number: "PO/26-27/00002", grandTotal: 20_000 })],
      financial: true,
      scope: CENTRAL,
    });
    const [orders, lines] = body.tables;
    expect(cell(orders, 0, "Project / Store")).toBe("Central Store Ambattur");
    expect(cell(orders, 0, "Total")).toBe(1_180_000);
    expect(orders?.totals?.[labels(orders).indexOf("Total")]).toBe(1_200_000);
    expect(cell(lines, 0, "Pending")).toBe(40);
    expect(cell(lines, 0, "GST %")).toBe(18);
  });

  it("leaves amounts out when told to", () => {
    const body = buildPurchaseOrderReport({
      rows: [order()],
      financial: false,
      scope: PROJECT,
    });
    expect(labels(body.tables[0])).not.toContain("Total");
    expect(labels(body.tables[1])).not.toContain("Rate");
    expect(labels(body.tables[0])).not.toContain("Project / Store");
  });
});

function receipt(
  overrides: Partial<MaterialReceivedReportRow> = {},
): MaterialReceivedReportRow {
  return {
    number: "GRN/26-27/00001",
    receiptDate: "2026-10-05",
    place: "Tower A",
    supplier: "Sri Murugan Traders",
    purchaseOrder: "PO/26-27/00001",
    invoiceNo: "INV-77",
    invoiceDate: "2026-10-04",
    challanNo: "DC-12",
    grnDcNo: null,
    vehicleNo: "TN 09 AB 1234",
    enteredBy: "Prabhu Saravanan",
    taxable: 600_000,
    gst: 108_000,
    total: 708_000,
    invoiceAmount: 708_000,
    lines: [
      {
        material: "Cement OPC 53",
        uom: "Bag",
        quantity: 60,
        unitRate: 10_000,
        gstRate: 18,
        total: 708_000,
      },
    ],
    ...overrides,
  };
}

describe("Material Received report (CM-903)", () => {
  it("prints amounts with Financial", () => {
    const body = buildMaterialReceivedReport({
      rows: [receipt()],
      financial: true,
      own: false,
      scope: PROJECT,
    });
    const [receipts, lines] = body.tables;
    expect(cell(receipts, 0, "Invoice No.")).toBe("INV-77");
    expect(cell(receipts, 0, "Total")).toBe(708_000);
    expect(cell(lines, 0, "Quantity")).toBe(60);
    expect(lines?.totals?.[labels(lines).indexOf("Total")]).toBe(708_000);
  });

  it("leaves rates and amounts out without Financial and says why; notes own receipts", () => {
    const body = buildMaterialReceivedReport({
      rows: [receipt({ taxable: null, gst: null, total: null })],
      financial: false,
      own: true,
      scope: PROJECT,
    });
    expect(labels(body.tables[0])).not.toContain("Taxable");
    expect(labels(body.tables[1])).not.toContain("Rate");
    expect(body.notes.join(" ")).toMatch(/need Financial on Material Received/);
    expect(body.notes.join(" ")).toMatch(/Only the receipts you entered/);
  });
});

describe("Material Transfer report (CM-903)", () => {
  it("prints the legacy columns and counts by status", () => {
    const body = buildMaterialTransferReport({
      rows: [
        {
          number: "MT/26-27/00001",
          transferDate: "2026-10-06",
          type: "Project to Store",
          from: "Tower A",
          to: "Central Store Ambattur",
          status: "Delivered",
          sentBy: "Prabhu Saravanan",
          receivedBy: "Kumar",
          deliveredOn: "2026-10-07",
          remark: "Excess cement",
          lines: [{ material: "Cement OPC 53", uom: "Bag", quantity: 10 }],
        },
      ],
      scope: PROJECT,
    });
    const [transfers, lines, byStatus] = body.tables;
    expect(labels(transfers)).toEqual(
      expect.arrayContaining([
        "Transfer No.",
        "Transfer Date",
        "Type",
        "From",
        "To",
        "Status",
        "Sent By",
        "Received By",
        "Remark",
      ]),
    );
    expect(cell(transfers, 0, "Received By")).toBe("Kumar");
    expect(cell(lines, 0, "Quantity")).toBe(10);
    expect(byStatus?.rows).toContainEqual(["Delivered", 1]);
  });
});

describe("Stock Register report (CM-903)", () => {
  const row = {
    place: "Tower A",
    material: "Cement OPC 53",
    category: "Cement",
    uom: "Bag",
    opening: 100,
    received: 50,
    transferredIn: 0,
    transferredOut: 10,
    issued: 0,
    receivedFromStore: 0,
    consumed: 30,
    missing: 1,
    adjustment: -2,
    closing: 107,
  };

  it("prints opening, every movement and closing per material, never adding units together", () => {
    const body = buildStockRegisterReport({ rows: [row], scope: PROJECT });
    const [table] = body.tables;
    expect(labels(table)).toEqual([
      "Material",
      "Category",
      "Unit",
      "Opening",
      "Received",
      "Transferred in",
      "Transferred out",
      "Issued",
      "Received from store",
      "Consumed",
      "Missing",
      "Adjustment",
      "Closing",
    ]);
    expect(cell(table, 0, "Closing")).toBe(107);
    expect(cell(table, 0, "Adjustment")).toBe(-2);
    expect(table?.totals?.slice(3).every((value) => value == null)).toBe(true);
  });

  it("names the Project or Store centrally, by place then material", () => {
    const body = buildStockRegisterReport({
      rows: [
        { ...row, place: "Tower B" },
        { ...row, place: "Central Store Ambattur", material: "Steel" },
      ],
      scope: CENTRAL,
    });
    expect(cell(body.tables[0], 0, "Project / Store")).toBe(
      "Central Store Ambattur",
    );
    expect(cell(body.tables[0], 1, "Project / Store")).toBe("Tower B");
  });
});
