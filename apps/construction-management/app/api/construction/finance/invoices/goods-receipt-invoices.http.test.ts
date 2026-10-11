import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it, vi } from "vitest";

import { POST as deleteGrn } from "@/app/api/construction/procurement/goods-receipts/[id]/delete/route";
import { GET as getGrn } from "@/app/api/construction/procurement/goods-receipts/[id]/route";
import { POST as updateGrn } from "@/app/api/construction/procurement/goods-receipts/[id]/update/route";
import { POST as postGrn } from "@/app/api/construction/procurement/goods-receipts/route";
import { partyFinance } from "@/src/composition/party-finance";
import { addDays } from "@/src/shared-kernel/calendar-date";
import { addMaterial } from "@/test/procurement";
import { addPurchaseOrder } from "@/test/procurement-orders";
import {
  codeOf,
  getFrom,
  idParams,
  json,
  partyBalance,
  partyWorld,
  postTo,
  TODAY,
  type PartyWorld,
} from "@/test/party-finance";

import { POST as recordPayment } from "../party-payments/route";
import { GET as getInvoice } from "./[id]/route";
import { GET as awaitingRoute } from "./awaiting-goods-receipts/route";
import type { ConstructionFinanceInvoiceResponse } from "./invoice-models";
import { GET as listInvoices, POST as createInvoice } from "./route";

vi.mock(import("@repo/auth/construction/server"), async (importOriginal) => ({
  ...(await importOriginal()),
  getCompanyAuthFromHeaders: vi.fn(),
}));

type Invoice = ConstructionFinanceInvoiceResponse;
type Grn = {
  id: string;
  number: string;
  totalValue: number;
  updatedAt: string;
  paid: boolean;
};

const GRN_BASE = "http://localhost/api/construction/procurement/goods-receipts";
const DAY = addDays(TODAY, -3);

function grnRequest(path: string, body: unknown): Request {
  return new Request(`${GRN_BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function setup() {
  const world = await partyWorld();
  await prisma.constructionProjectsProject.update({
    where: { id: world.projectId },
    data: { stateCode: "33" },
  });
  const cement = await addMaterial(world.workspaceId, world.ownerId, {
    unitRate: 400_00n,
    gstRate: "18",
    hsnCode: "2523",
  });
  return { world, cement };
}

type Setup = Awaited<ReturnType<typeof setup>>;

/** 100 bags at ₹400 + 18% GST = ₹47,200. */
function grnBody(s: Setup, patch: Record<string, unknown> = {}) {
  return {
    locationKind: "project",
    locationId: s.world.projectId,
    receiptDate: DAY,
    inventoryDate: DAY,
    supplierId: s.world.supplierId,
    lines: [
      {
        materialId: s.cement.id,
        quantity: "100",
        unitRate: 400_00,
        gstRate: "18",
      },
    ],
    ...patch,
  };
}

async function receive(s: Setup, patch: Record<string, unknown> = {}) {
  const response = await postGrn(grnRequest("", grnBody(s, patch)));
  expect(response.status).toBe(StatusCodes.CREATED);
  return json<Grn>(response);
}

async function invoicesOf(world: PartyWorld): Promise<Invoice[]> {
  return (
    await json<{ items: Invoice[] }>(
      await listInvoices(
        getFrom("/invoices", {
          projectId: world.projectId,
          partyType: "supplier",
        }),
      ),
    )
  ).items;
}

async function awaiting(world: PartyWorld): Promise<{ id: string }[]> {
  return (
    await json<{ items: { id: string }[] }>(
      await awaitingRoute(
        getFrom("/invoices/awaiting-goods-receipts", {
          projectId: world.projectId,
        }),
      ),
    )
  ).items;
}

describe("Supplier invoices from Goods Receipts (CM-705, CM-0017 §13)", () => {
  it("creates the invoice when a GRN is posted with an invoice number, due by the PO's terms", async () => {
    const s = await setup();
    const order = await addPurchaseOrder(s.world.workspaceId, s.world.ownerId, {
      location: { kind: "project", id: s.world.projectId },
      supplierId: s.world.supplierId,
      lines: [
        {
          materialId: s.cement.id,
          uomId: s.cement.uomId,
          quantity: "100",
          unitRate: 400_00n,
          gstRate: "18",
        },
      ],
    });
    await prisma.constructionProcurementPurchaseOrder.update({
      where: { id: order.id },
      data: { paymentTermsDays: 30 },
    });
    const grn = await receive(s, {
      purchaseOrderId: order.id,
      lines: [{ purchaseOrderItemId: order.lineIds[0], quantity: "100" }],
      invoiceNo: "SMT/2026/118",
      invoiceDate: DAY,
      invoiceAmount: 47_250_00,
    });
    expect(grn.totalValue).toBe(47_200_00);
    const [invoice] = await invoicesOf(s.world);
    expect(invoice).toMatchObject({
      origin: "goods_receipt",
      invoiceNumber: "SMT/2026/118",
      invoiceDate: DAY,
      dueDate: addDays(DAY, 30),
      amount: 47_250_00,
      grnValue: 47_200_00,
      // ₹50 more than the GRN's value.
      variance: true,
      goodsReceipts: [{ id: grn.id, number: grn.number }],
    });
    expect(await awaiting(s.world)).toEqual([]);
    expect(
      await partyBalance(
        s.world.workspaceId,
        "supplier",
        s.world.supplierId,
        s.world.projectId,
      ),
    ).toBe(47_250_00n);
  });

  it("follows an edited GRN, is idempotent, and is deleted with it", async () => {
    const s = await setup();
    const grn = await receive(s, { invoiceNo: "INV-9" });
    const [created] = await invoicesOf(s.world);
    expect(created).toMatchObject({ amount: 47_200_00, invoiceDate: DAY });

    // The listener again (a replayed event) changes nothing.
    expect(
      await partyFinance().goodsReceipts.sync(s.world.workspaceId, grn.id),
    ).toBe("unchanged");
    expect(await invoicesOf(s.world)).toHaveLength(1);

    const edited = await updateGrn(
      grnRequest(`/${grn.id}/update`, {
        ...grnBody(s, {
          invoiceNo: "INV-9",
          invoiceAmount: 50_000_00,
        }),
        expectedUpdatedAt: grn.updatedAt,
      }),
      idParams(grn.id),
    );
    expect(edited.status).toBe(StatusCodes.OK);
    const [followed] = await invoicesOf(s.world);
    expect(followed).toMatchObject({
      id: created?.id,
      amount: 50_000_00,
      variance: true,
    });
    expect(
      await partyBalance(
        s.world.workspaceId,
        "supplier",
        s.world.supplierId,
        s.world.projectId,
      ),
    ).toBe(50_000_00n);

    const current = await json<Grn>(
      await getGrn(new Request(`${GRN_BASE}/${grn.id}`), idParams(grn.id)),
    );
    const deleted = await deleteGrn(
      grnRequest(`/${grn.id}/delete`, { expectedUpdatedAt: current.updatedAt }),
      idParams(grn.id),
    );
    expect(deleted.status).toBe(StatusCodes.NO_CONTENT);
    expect(await invoicesOf(s.world)).toEqual([]);
    expect(
      await partyBalance(
        s.world.workspaceId,
        "supplier",
        s.world.supplierId,
        s.world.projectId,
      ),
    ).toBe(0n);
  });

  it("lists GRNs awaiting an invoice and gathers several into one", async () => {
    const s = await setup();
    const first = await receive(s);
    const second = await receive(s, {
      lines: [
        {
          materialId: s.cement.id,
          quantity: "50",
          unitRate: 400_00,
          gstRate: "18",
        },
      ],
    });
    expect((await awaiting(s.world)).map((row) => row.id).sort()).toEqual(
      [first.id, second.id].sort(),
    );
    const response = await createInvoice(
      postTo("/invoices", {
        partyType: "supplier",
        partyId: s.world.supplierId,
        projectId: s.world.projectId,
        invoiceNumber: "SMT/OCT",
        invoiceDate: TODAY,
        goodsReceiptIds: [first.id, second.id],
      }),
    );
    expect(response.status).toBe(StatusCodes.CREATED);
    const invoice = await json<Invoice>(response);
    expect(invoice).toMatchObject({
      origin: "manual",
      amount: 70_800_00,
      grnValue: 70_800_00,
      variance: false,
    });
    expect(invoice.goodsReceipts).toHaveLength(2);
    expect(await awaiting(s.world)).toEqual([]);

    const again = await createInvoice(
      postTo("/invoices", {
        partyType: "supplier",
        partyId: s.world.supplierId,
        projectId: s.world.projectId,
        invoiceNumber: "SMT/OCT-2",
        invoiceDate: TODAY,
        goodsReceiptIds: [first.id],
      }),
    );
    expect(again.status).toBe(StatusCodes.CONFLICT);
    expect(await codeOf(again)).toBe("GOODS_RECEIPT_INVOICED");
  });

  it("refuses to edit or delete a GRN once a payment is allocated to its invoice", async () => {
    const s = await setup();
    const grn = await receive(s, { invoiceNo: "INV-PAID" });
    const [invoice] = await invoicesOf(s.world);
    const payment = await recordPayment(
      postTo("/party-payments", {
        partyType: "supplier",
        partyId: s.world.supplierId,
        projectId: s.world.projectId,
        paymentDate: TODAY,
        accountId: s.world.cashId,
        mode: "cash",
        amount: 10_000_00,
        allocations: [{ invoiceId: invoice?.id, amount: 10_000_00 }],
      }),
    );
    expect(payment.status).toBe(StatusCodes.CREATED);

    const view = await json<Grn>(
      await getGrn(new Request(`${GRN_BASE}/${grn.id}`), idParams(grn.id)),
    );
    expect(view.paid).toBe(true);
    const edit = await updateGrn(
      grnRequest(`/${grn.id}/update`, {
        ...grnBody(s, { invoiceNo: "INV-PAID" }),
        expectedUpdatedAt: view.updatedAt,
      }),
      idParams(grn.id),
    );
    expect(edit.status).toBe(StatusCodes.CONFLICT);
    expect(await codeOf(edit)).toBe("GOODS_RECEIPT_PAID");
    const remove = await deleteGrn(
      grnRequest(`/${grn.id}/delete`, { expectedUpdatedAt: view.updatedAt }),
      idParams(grn.id),
    );
    expect(await codeOf(remove)).toBe("GOODS_RECEIPT_PAID");
    const still = await getInvoice(
      getFrom(`/invoices/${invoice?.id ?? ""}`),
      idParams(invoice?.id ?? ""),
    );
    expect((await json<Invoice>(still)).status).toBe("partly_paid");
  });
});
