import { randomUUID } from "node:crypto";

import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it } from "vitest";

import { GET as getOpenApi } from "@/app/api/openapi.json/route";
import type { StockLocation } from "@/src/procurement/domain/stock-location";
import { PrismaStockLedger } from "@/src/procurement/infrastructure/prisma-stock-ledger";
import type { Flag } from "@/src/shared-kernel/access";
import { addDays, todayIn } from "@/src/shared-kernel/calendar-date";
import { newId } from "@/src/shared-kernel/ids";
import {
  addProject,
  jsonRequest,
  memberWith,
  ownerWithCompany,
} from "@/test/companies";
import { addMaterial, addStore, addSupplier } from "@/test/procurement";
import { addPurchaseOrder, orderReceipt } from "@/test/procurement-orders";
import { TEST_ORIGIN } from "@/test/sessions";

import { POST as deleteReceipt } from "./[id]/delete/route";
import { GET as getPdf } from "./[id]/pdf/route";
import { GET as getReceipt } from "./[id]/route";
import { POST as updateReceipt } from "./[id]/update/route";
import { GET as getFormOptions } from "./form-options/route";
import type {
  ConstructionProcurementGoodsReceiptResponseModel,
  GetConstructionProcurementGoodsReceiptFormOptionsResponseModel,
  ListConstructionProcurementGoodsReceiptsResponseModel,
} from "./goods-receipt-models";
import { GET as listReceipts, POST as postReceipt } from "./route";

const BASE = `${TEST_ORIGIN}/api/construction/procurement/goods-receipts`;
const TODAY = todayIn("Asia/Kolkata");
const DAY_BEFORE = addDays(TODAY, -2);
const YESTERDAY = addDays(TODAY, -1);

type Receipt = ConstructionProcurementGoodsReceiptResponseModel;
type Page = ListConstructionProcurementGoodsReceiptsResponseModel;
type Company = Awaited<ReturnType<typeof ownerWithCompany>>;

const ledger = new PrismaStockLedger();

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function codeOf(response: Response): Promise<string> {
  return (await json<{ code: string }>(response)).code;
}

function idContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

function post(cookie: string, body: unknown) {
  return postReceipt(jsonRequest(BASE, cookie, body));
}

function update(cookie: string, id: string, body: unknown) {
  return updateReceipt(
    jsonRequest(`${BASE}/${id}/update`, cookie, body),
    idContext(id),
  );
}

function remove(cookie: string, id: string, expectedUpdatedAt: string) {
  return deleteReceipt(
    jsonRequest(`${BASE}/${id}/delete`, cookie, { expectedUpdatedAt }),
    idContext(id),
  );
}

function get(cookie: string, id: string) {
  return getReceipt(jsonRequest(`${BASE}/${id}`, cookie), idContext(id));
}

function list(cookie: string, query: Record<string, string>) {
  return listReceipts(
    jsonRequest(`${BASE}?${new URLSearchParams(query).toString()}`, cookie),
  );
}

async function stockOf(
  workspaceId: string,
  location: StockLocation,
  materialId: string,
): Promise<string> {
  return (
    (await ledger.stock(prisma, workspaceId, location, [materialId])).get(
      materialId,
    ) ?? "0"
  );
}

/** A Project in Tamil Nadu with a Tamil Nadu supplier and two materials. */
async function fixtures(company: Company) {
  const { workspaceId, userId } = company;
  const projectId = await addProject(workspaceId, userId, "Tower A");
  await prisma.constructionProjectsProject.update({
    where: { id: projectId },
    data: { stateCode: "33" },
  });
  const site: StockLocation = { kind: "project", id: projectId };
  const supplierId = await addSupplier(workspaceId, userId, {
    name: "Sri Murugan Traders",
    projectIds: [projectId],
  });
  const cement = await addMaterial(workspaceId, userId, {
    name: "Cement OPC 53",
    unitRate: 38_500n,
    gstRate: "28",
    hsnCode: "2523",
  });
  const steel = await addMaterial(workspaceId, userId, {
    name: "TMT Steel 12 mm",
    unitRate: 6_250n,
    gstRate: "18",
    hsnCode: "7214",
  });
  return { projectId, site, supplierId, cement, steel };
}

type Fixtures = Awaited<ReturnType<typeof fixtures>>;

async function orderFor(company: Company, f: Fixtures) {
  return addPurchaseOrder(company.workspaceId, company.userId, {
    location: f.site,
    supplierId: f.supplierId,
    lines: [
      {
        materialId: f.cement.id,
        materialName: f.cement.name,
        uomId: f.cement.uomId,
        quantity: "100",
        unitRate: 40_000n,
        gstRate: "28",
      },
      {
        materialId: f.steel.id,
        materialName: f.steel.name,
        uomId: f.steel.uomId,
        quantity: "50",
        unitRate: 6_000n,
        discountPercent: "10",
        gstRate: "18",
        hsnCode: "7214",
      },
    ],
  });
}

function receiptBody(
  f: Fixtures,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    locationKind: "project",
    locationId: f.projectId,
    receiptDate: DAY_BEFORE,
    inventoryDate: DAY_BEFORE,
    supplierId: f.supplierId,
    lines: [{ materialId: f.cement.id, quantity: "100" }],
    ...overrides,
  };
}

async function memberOn(company: Company, projectId: string, flags: Flag[]) {
  const member = await memberWith(company, {
    "procurement.material_received": flags,
  });
  await prisma.constructionOrganizationTeamMemberProject.create({
    data: { memberId: member.memberId, projectId },
  });
  return member;
}

describe("Goods Receipts (CM-505)", () => {
  it("receives a PO in two GRNs: partially received, then received with an excess", async () => {
    const owner = await ownerWithCompany();
    const f = await fixtures(owner);
    const order = await orderFor(owner, f);
    const [cementLine, steelLine] = order.lineIds;

    const first = await post(
      owner.cookie,
      receiptBody(f, {
        purchaseOrderId: order.id,
        invoiceNo: "SMT/2026/118",
        invoiceAmount: 3_400_000,
        deliveryChallanNo: "DC-4471",
        vehicleNo: "tn 09 ab 1234",
        driverName: "Murugan",
        driverMobile: "77081 65767",
        ewayBillNo: "1234 5678 9012",
        lines: [
          { purchaseOrderItemId: cementLine, quantity: "60" },
          { purchaseOrderItemId: steelLine, quantity: "50" },
        ],
      }),
    );
    expect(first.status).toBe(StatusCodes.CREATED);
    const grn = await json<Receipt>(first);
    expect(grn.number).toMatch(/^GRN\//);
    expect(grn.purchaseOrder).toEqual({ id: order.id, number: order.number });
    expect(grn.supplyType).toBe("intra_state");
    expect(grn.vehicleNo).toBe("TN 09 AB 1234");
    expect(grn.driverMobile).toBe("+917708165767");
    expect(grn.ewayBillNo).toBe("123456789012");
    // Cement at the PO rate; steel at the PO's net rate (10% off ₹60).
    const [cement, steel] = grn.lines;
    expect(cement).toMatchObject({
      orderedQty: "100.000",
      receivedQty: "60.000",
      totalReceivedQty: "60.000",
      excessQty: null,
      unitRate: 40_000,
      taxable: 2_400_000,
      cgst: 336_000,
      sgst: 336_000,
      total: 3_072_000,
    });
    expect(steel).toMatchObject({ unitRate: 5_400, taxable: 270_000 });
    expect(grn.totalValue).toBe(3_072_000 + 270_000 + 48_600);
    expect(await orderReceipt(order.id)).toEqual({
      receiptStatus: "partially_received",
      received: ["60.000", "50.000"],
    });
    expect(await stockOf(owner.workspaceId, f.site, f.cement.id)).toBe(
      "60.000",
    );
    const entries = await prisma.constructionProcurementStockEntry.findMany({
      where: { sourceType: "goods_receipt", sourceId: grn.id },
    });
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      type: "received",
      counterpartyLabel: "Sri Murugan Traders",
    });
    expect(
      entries.find((entry) => entry.materialId === f.cement.id)?.unitRate,
    ).toBe(40_000n);

    const second = await post(
      owner.cookie,
      receiptBody(f, {
        purchaseOrderId: order.id,
        receiptDate: YESTERDAY,
        inventoryDate: TODAY,
        lines: [{ purchaseOrderItemId: cementLine, quantity: "50" }],
      }),
    );
    expect(second.status).toBe(StatusCodes.CREATED);
    const excess = await json<Receipt>(second);
    expect(excess.lines[0]).toMatchObject({
      receivedElsewhereQty: "60.000",
      totalReceivedQty: "110.000",
      excessQty: "10.000",
    });
    expect(await orderReceipt(order.id)).toEqual({
      receiptStatus: "received",
      received: ["110.000", "50.000"],
    });

    // A received PO takes no new GRN and leaves the form's list.
    const third = await post(
      owner.cookie,
      receiptBody(f, {
        purchaseOrderId: order.id,
        lines: [{ purchaseOrderItemId: cementLine, quantity: "1" }],
      }),
    );
    expect(third.status).toBe(StatusCodes.CONFLICT);
    expect(await codeOf(third)).toBe("PURCHASE_ORDER_RECEIVED");
    const options =
      await json<GetConstructionProcurementGoodsReceiptFormOptionsResponseModel>(
        await getFormOptions(
          jsonRequest(
            `${BASE}/form-options?locationKind=project&locationId=${f.projectId}`,
            owner.cookie,
          ),
        ),
      );
    expect(options.purchaseOrders).toEqual([]);
    expect(options.suppliers.map((s) => s.name)).toEqual([
      "Sri Murugan Traders",
    ]);
    // Editing the first keeps its PO offered, with the other GRN's quantity.
    const editing =
      await json<GetConstructionProcurementGoodsReceiptFormOptionsResponseModel>(
        await getFormOptions(
          jsonRequest(
            `${BASE}/form-options?locationKind=project&locationId=${f.projectId}&goodsReceiptId=${grn.id}`,
            owner.cookie,
          ),
        ),
      );
    expect(editing.purchaseOrders[0]?.lines[0]).toMatchObject({
      orderedQty: "100.000",
      receivedQty: "50.000",
      unitRate: 40_000,
    });

    // List: filters and search.
    const all = await json<Page>(
      await list(owner.cookie, {
        locationKind: "project",
        locationId: f.projectId,
      }),
    );
    expect(all.total).toBe(2);
    expect(all.suppliers).toEqual([
      { id: f.supplierId, name: "Sri Murugan Traders" },
    ]);
    expect(all.items[0]?.id).toBe(excess.id);
    expect(all.items[1]).toMatchObject({
      lineCount: 2,
      invoiceNo: "SMT/2026/118",
    });
    const searched = await json<Page>(
      await list(owner.cookie, {
        locationKind: "project",
        locationId: f.projectId,
        search: "dc-4471",
      }),
    );
    expect(searched.items.map((item) => item.id)).toEqual([grn.id]);
    const without = await json<Page>(
      await list(owner.cookie, {
        locationKind: "project",
        locationId: f.projectId,
        purchaseOrder: "without",
      }),
    );
    expect(without.total).toBe(0);

    // Deleting the second reverses its stock and the PO's receipt.
    const deleted = await remove(owner.cookie, excess.id, excess.updatedAt);
    expect(deleted.status).toBe(StatusCodes.NO_CONTENT);
    expect(await orderReceipt(order.id)).toEqual({
      receiptStatus: "partially_received",
      received: ["60.000", "50.000"],
    });
    expect(await stockOf(owner.workspaceId, f.site, f.cement.id)).toBe(
      "60.000",
    );
    expect((await get(owner.cookie, excess.id)).status).toBe(
      StatusCodes.NOT_FOUND,
    );
    const audits = await prisma.constructionOrganizationAuditEvent.findMany({
      where: { workspaceId: owner.workspaceId, entityType: "goods_receipt" },
      select: { action: true },
    });
    expect(audits.map((audit) => audit.action).sort()).toEqual([
      "goods_receipt.deleted",
      "goods_receipt.posted",
      "goods_receipt.posted",
    ]);
  });

  it("posts without a PO at the Material's rate, IGST across states", async () => {
    const owner = await ownerWithCompany();
    const f = await fixtures(owner);
    const karnataka = await addSupplier(owner.workspaceId, owner.userId, {
      name: "Bengaluru Steels",
      gstin: "29AABCB1234C1Z5",
      projectIds: [f.projectId],
    });
    const response = await post(
      owner.cookie,
      receiptBody(f, {
        supplierId: karnataka,
        lines: [
          { materialId: f.steel.id, quantity: "200" },
          {
            materialId: f.cement.id,
            quantity: "10",
            unitRate: 39_000,
            gstRate: "18",
            hsnCode: "252329",
          },
        ],
      }),
    );
    expect(response.status).toBe(StatusCodes.CREATED);
    const grn = await json<Receipt>(response);
    expect(grn.purchaseOrder).toBeNull();
    expect(grn.supplyType).toBe("inter_state");
    expect(grn.lines[0]).toMatchObject({
      unitRate: 6_250,
      gstRate: "18.00",
      hsnCode: "7214",
      taxable: 1_250_000,
      igst: 225_000,
      cgst: 0,
      orderedQty: null,
      excessQty: null,
    });
    expect(grn.lines[1]).toMatchObject({
      unitRate: 39_000,
      gstRate: "18.00",
      hsnCode: "252329",
    });
    expect(grn.igstTotal).toBe(225_000 + 70_200);

    // A supplier off the Project, a PO line without a PO, a repeated material.
    const outsider = await addSupplier(owner.workspaceId, owner.userId);
    const refusals: [Record<string, unknown>, string][] = [
      [{ supplierId: outsider }, "SUPPLIER_NOT_ON_LOCATION"],
      [
        { lines: [{ purchaseOrderItemId: randomUUID(), quantity: "1" }] },
        "PURCHASE_ORDER_REQUIRED",
      ],
      [
        {
          lines: [
            { materialId: f.steel.id, quantity: "1" },
            { materialId: f.steel.id, quantity: "2" },
          ],
        },
        "MATERIAL_REPEATED",
      ],
      [{ lines: [] }, "GOODS_RECEIPT_LINES_REQUIRED"],
      [{ driverMobile: "12345" }, "DRIVER_MOBILE_INVALID"],
      [{ ewayBillNo: "12AB" }, "EWAY_BILL_NO_INVALID"],
      [{ receiptDate: addDays(TODAY, 1) }, "GOODS_RECEIPT_DATE_IN_FUTURE"],
      [
        { receiptDate: YESTERDAY, inventoryDate: DAY_BEFORE },
        "INVENTORY_DATE_BEFORE_RECEIPT",
      ],
    ];
    for (const [overrides, code] of refusals) {
      const refused = await post(owner.cookie, receiptBody(f, overrides));
      expect(refused.status, code).toBe(StatusCodes.BAD_REQUEST);
      expect(await codeOf(refused)).toBe(code);
    }
  });

  it("checks the linked PO: supplier, location, approval, close and lines", async () => {
    const owner = await ownerWithCompany();
    const f = await fixtures(owner);
    const order = await orderFor(owner, f);
    const other = await addSupplier(owner.workspaceId, owner.userId, {
      projectIds: [f.projectId],
    });
    const elsewhere = await addProject(owner.workspaceId, owner.userId);
    const line = (purchaseOrderItemId: string) => [
      { purchaseOrderItemId, quantity: "5" },
    ];
    const lineOf = async (orderId: string) =>
      (
        await prisma.constructionProcurementPurchaseOrderItem.findFirstOrThrow({
          where: { purchaseOrderId: orderId },
        })
      ).id;
    const pending = await addPurchaseOrder(owner.workspaceId, owner.userId, {
      location: f.site,
      supplierId: f.supplierId,
      approvalStatus: "pending",
      lines: [
        {
          materialId: f.cement.id,
          uomId: f.cement.uomId,
          quantity: "10",
          unitRate: 100n,
        },
      ],
    });
    const closed = await addPurchaseOrder(owner.workspaceId, owner.userId, {
      location: f.site,
      supplierId: f.supplierId,
      closed: true,
      lines: [
        {
          materialId: f.cement.id,
          uomId: f.cement.uomId,
          quantity: "10",
          unitRate: 100n,
        },
      ],
    });
    const away = await addPurchaseOrder(owner.workspaceId, owner.userId, {
      location: { kind: "project", id: elsewhere },
      supplierId: f.supplierId,
      lines: [
        {
          materialId: f.cement.id,
          uomId: f.cement.uomId,
          quantity: "10",
          unitRate: 100n,
        },
      ],
    });
    const cases: [Record<string, unknown>, number, string][] = [
      [
        {
          purchaseOrderId: order.id,
          supplierId: other,
          lines: line(order.lineIds[0] ?? ""),
        },
        StatusCodes.BAD_REQUEST,
        "PURCHASE_ORDER_OTHER_SUPPLIER",
      ],
      [
        { purchaseOrderId: away.id, lines: line(await lineOf(away.id)) },
        StatusCodes.BAD_REQUEST,
        "PURCHASE_ORDER_OTHER_LOCATION",
      ],
      [
        { purchaseOrderId: pending.id, lines: line(await lineOf(pending.id)) },
        StatusCodes.CONFLICT,
        "PURCHASE_ORDER_NOT_APPROVED",
      ],
      [
        { purchaseOrderId: closed.id, lines: line(await lineOf(closed.id)) },
        StatusCodes.CONFLICT,
        "PURCHASE_ORDER_CLOSED",
      ],
      [
        { purchaseOrderId: order.id, lines: line(await lineOf(closed.id)) },
        StatusCodes.BAD_REQUEST,
        "GOODS_RECEIPT_LINE_NOT_ON_ORDER",
      ],
      [
        { purchaseOrderId: randomUUID(), lines: line(randomUUID()) },
        StatusCodes.BAD_REQUEST,
        "PURCHASE_ORDER_NOT_FOUND",
      ],
    ];
    for (const [overrides, status, code] of cases) {
      const refused = await post(owner.cookie, receiptBody(f, overrides));
      expect(refused.status, code).toBe(status);
      expect(await codeOf(refused)).toBe(code);
    }
  });

  it("refuses an edit or delete once the stock it brought has gone out", async () => {
    const owner = await ownerWithCompany();
    const f = await fixtures(owner);
    const posted = await json<Receipt>(
      await post(owner.cookie, receiptBody(f)),
    );
    // 80 of the 100 bags consumed the day after.
    await prisma.$transaction((tx) =>
      ledger.post(tx, { workspaceId: owner.workspaceId, by: owner.userId }, [
        {
          location: f.site,
          materialId: f.cement.id,
          entryDate: YESTERDAY,
          type: "consumed",
          quantity: "80",
          source: { type: "stock_movement", id: newId() },
        },
      ]),
    );
    const editBody = (quantity: string, expectedUpdatedAt: string) => ({
      receiptDate: DAY_BEFORE,
      inventoryDate: DAY_BEFORE,
      supplierId: f.supplierId,
      lines: [{ id: posted.lines[0]?.id, materialId: f.cement.id, quantity }],
      expectedUpdatedAt,
    });

    const negative = await update(
      owner.cookie,
      posted.id,
      editBody("50", posted.updatedAt),
    );
    expect(negative.status).toBe(StatusCodes.CONFLICT);
    const error = await json<{
      code: string;
      message: string;
      details: { shortfalls: { materialName: string; shortBy: string }[] };
    }>(negative);
    expect(error.code).toBe("STOCK_INSUFFICIENT");
    expect(error.message).toContain("Cement OPC 53");
    expect(error.details.shortfalls[0]).toMatchObject({
      materialName: "Cement OPC 53",
      shortBy: "30.000",
    });
    const refusedDelete = await remove(
      owner.cookie,
      posted.id,
      posted.updatedAt,
    );
    expect(refusedDelete.status).toBe(StatusCodes.CONFLICT);
    expect(await codeOf(refusedDelete)).toBe("STOCK_INSUFFICIENT");
    expect(await stockOf(owner.workspaceId, f.site, f.cement.id)).toBe(
      "20.000",
    );

    const edited = await update(
      owner.cookie,
      posted.id,
      editBody("90", posted.updatedAt),
    );
    expect(edited.status).toBe(StatusCodes.OK);
    const after = await json<Receipt>(edited);
    expect(after.lines[0]?.id).toBe(posted.lines[0]?.id);
    expect(after.lines[0]?.receivedQty).toBe("90.000");
    expect(await stockOf(owner.workspaceId, f.site, f.cement.id)).toBe(
      "10.000",
    );
    // The history keeps the reversal and the new entry.
    expect(
      await prisma.constructionProcurementStockEntry.count({
        where: { sourceType: "goods_receipt", sourceId: posted.id },
      }),
    ).toBe(3);

    const stale = await update(
      owner.cookie,
      posted.id,
      editBody("95", posted.updatedAt),
    );
    expect(stale.status).toBe(StatusCodes.CONFLICT);
    expect(await codeOf(stale)).toBe("GOODS_RECEIPT_CHANGED");
  });

  it("applies the back-dated policy to the GR and Inventory dates", async () => {
    const owner = await ownerWithCompany();
    const f = await fixtures(owner);
    const member = await memberOn(owner, f.projectId, [
      "read",
      "create",
      "update",
      "view_all",
      "financial",
    ]);
    await prisma.constructionOrganizationBackdatedEntryPolicy.create({
      data: {
        id: newId(),
        workspaceId: owner.workspaceId,
        createDays: 0,
        createOverrideDesignationIds: [],
        editDays: 0,
        editOverrideDesignationIds: [],
        modules: {
          goods_receipt: {
            mode: "custom",
            create: { days: 3, overrideDesignationIds: [] },
            edit: { days: 3, overrideDesignationIds: [] },
          },
        },
        createdBy: owner.userId,
        updatedBy: owner.userId,
      },
    });
    const old = addDays(TODAY, -10);
    const refused = await post(
      member.cookie,
      receiptBody(f, { receiptDate: old, inventoryDate: old }),
    );
    expect(refused.status).toBe(StatusCodes.FORBIDDEN);
    expect(await codeOf(refused)).toBe("BACKDATED_CREATE_BLOCKED");

    const ok = await post(member.cookie, receiptBody(f));
    expect(ok.status).toBe(StatusCodes.CREATED);
    const grn = await json<Receipt>(ok);
    const moved = await update(member.cookie, grn.id, {
      receiptDate: old,
      inventoryDate: old,
      supplierId: f.supplierId,
      lines: [{ materialId: f.cement.id, quantity: "100" }],
      expectedUpdatedAt: grn.updatedAt,
    });
    expect(moved.status).toBe(StatusCodes.FORBIDDEN);
    expect(await codeOf(moved)).toBe("BACKDATED_EDIT_BLOCKED");
    // The Owner is not limited.
    const owners = await post(
      owner.cookie,
      receiptBody(f, { receiptDate: old, inventoryDate: old }),
    );
    expect(owners.status).toBe(StatusCodes.CREATED);
  });

  it("hides values without Financial and others' GRNs without View All", async () => {
    const owner = await ownerWithCompany();
    const f = await fixtures(owner);
    const order = await orderFor(owner, f);
    const ownersGrn = await json<Receipt>(
      await post(owner.cookie, receiptBody(f)),
    );
    const member = await memberOn(owner, f.projectId, [
      "read",
      "create",
      "update",
    ]);
    const response = await post(
      member.cookie,
      receiptBody(f, {
        purchaseOrderId: order.id,
        invoiceAmount: 999_999,
        lines: [
          {
            purchaseOrderItemId: order.lineIds[1],
            quantity: "10",
            unitRate: 1,
            gstRate: "0",
          },
        ],
      }),
    );
    expect(response.status).toBe(StatusCodes.CREATED);
    const grn = await json<Receipt>(response);
    expect(grn.financial).toBe(false);
    expect(grn.lines[0]).toMatchObject({
      unitRate: null,
      total: null,
      gstRate: "18.00",
    });
    expect(grn.totalValue).toBeNull();
    expect(grn.invoiceAmount).toBeNull();
    // Stored at the PO's net rate, not what was sent; no invoice amount.
    const stored =
      await prisma.constructionProcurementGoodsReceipt.findUniqueOrThrow({
        where: { id: grn.id },
        include: { items: true },
      });
    expect(stored.items[0]?.unitRate).toBe(5_400n);
    expect(stored.invoiceAmount).toBeNull();
    expect(stored.totalValue).toBe(54_000n + 9_720n);

    const page = await json<Page>(
      await list(member.cookie, {
        locationKind: "project",
        locationId: f.projectId,
      }),
    );
    expect(page.items.map((item) => item.id)).toEqual([grn.id]);
    expect(page.items[0]?.totalValue).toBeNull();
    expect((await get(member.cookie, ownersGrn.id)).status).toBe(
      StatusCodes.NOT_FOUND,
    );
    expect((await get(owner.cookie, grn.id)).status).toBe(StatusCodes.OK);

    // No delete flag; no access on another Project.
    expect((await remove(member.cookie, grn.id, grn.updatedAt)).status).toBe(
      StatusCodes.FORBIDDEN,
    );
    const elsewhere = await addProject(owner.workspaceId, owner.userId);
    const other = await list(member.cookie, {
      locationKind: "project",
      locationId: elsewhere,
    });
    expect(other.status).toBe(StatusCodes.FORBIDDEN);
  });

  it("honours the Company's hidden GRN fields and prints the PDF", async () => {
    const owner = await ownerWithCompany();
    const f = await fixtures(owner);
    await prisma.constructionOrganizationGrnFieldSetting.create({
      data: {
        workspaceId: owner.workspaceId,
        hiddenFields: ["vehicleNo", "driverMobile", "invoiceNo"],
        updatedBy: owner.userId,
      },
    });
    const response = await post(
      owner.cookie,
      receiptBody(f, {
        invoiceNo: "INV-1",
        vehicleNo: "TN 09 AB 1234",
        // Not validated while hidden.
        driverMobile: "not a number",
        deliveryChallanNo: "DC-9",
        remark: "Unloaded at Wing B",
      }),
    );
    expect(response.status).toBe(StatusCodes.CREATED);
    const grn = await json<Receipt>(response);
    expect(grn.hiddenFields).toEqual([
      "invoiceNo",
      "vehicleNo",
      "driverMobile",
    ]);
    expect(grn).toMatchObject({
      invoiceNo: null,
      vehicleNo: null,
      driverMobile: null,
      deliveryChallanNo: "DC-9",
      remark: "Unloaded at Wing B",
    });
    const stored =
      await prisma.constructionProcurementGoodsReceipt.findUniqueOrThrow({
        where: { id: grn.id },
      });
    expect(stored.vehicleNo).toBeNull();
    expect(stored.invoiceNo).toBeNull();

    const pdf = await getPdf(
      jsonRequest(`${BASE}/${grn.id}/pdf`, owner.cookie),
      idContext(grn.id),
    );
    expect(pdf.status).toBe(StatusCodes.OK);
    expect(pdf.headers.get("content-type")).toBe("application/pdf");
    const bytes = new Uint8Array(await pdf.arrayBuffer());
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
  });

  it("posts to a Store with a Supplier of the Store", async () => {
    const owner = await ownerWithCompany();
    const f = await fixtures(owner);
    const storeId = await addStore(owner.workspaceId, owner.userId, [
      f.projectId,
    ]);
    await prisma.constructionProcurementStoreSupplier.create({
      data: { storeId, supplierId: f.supplierId },
    });
    const store: StockLocation = { kind: "store", id: storeId };
    const response = await post(
      owner.cookie,
      receiptBody(f, { locationKind: "store", locationId: storeId }),
    );
    expect(response.status).toBe(StatusCodes.CREATED);
    const grn = await json<Receipt>(response);
    expect(grn.locationKind).toBe("store");
    expect(await stockOf(owner.workspaceId, store, f.cement.id)).toBe(
      "100.000",
    );
    const offStore = await addSupplier(owner.workspaceId, owner.userId, {
      projectIds: [f.projectId],
    });
    const refused = await post(
      owner.cookie,
      receiptBody(f, {
        locationKind: "store",
        locationId: storeId,
        supplierId: offStore,
      }),
    );
    expect(await codeOf(refused)).toBe("SUPPLIER_NOT_ON_LOCATION");
  });

  it("is listed in the OpenAPI document", async () => {
    const document = await json<{
      paths: Record<string, Record<string, unknown>>;
      components: { schemas: Record<string, unknown> };
    }>(getOpenApi());
    for (const path of [
      "/api/construction/procurement/goods-receipts",
      "/api/construction/procurement/goods-receipts/form-options",
      "/api/construction/procurement/goods-receipts/{id}",
      "/api/construction/procurement/goods-receipts/{id}/update",
      "/api/construction/procurement/goods-receipts/{id}/delete",
      "/api/construction/procurement/goods-receipts/{id}/pdf",
    ])
      expect(document.paths[path], path).toBeDefined();
    for (const schema of [
      "PostConstructionProcurementGoodsReceiptRequest",
      "ConstructionProcurementGoodsReceiptResponse",
      "ListConstructionProcurementGoodsReceiptsResponse",
    ])
      expect(document.components.schemas[schema], schema).toBeDefined();
  });
});
