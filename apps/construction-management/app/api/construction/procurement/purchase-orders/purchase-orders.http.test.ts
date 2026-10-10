import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { PDFDict, PDFDocument, PDFName } from "pdf-lib";
import { describe, expect, it, vi } from "vitest";

import { GET as getOpenApi } from "@/app/api/openapi.json/route";
import { addDays, todayIn } from "@/src/shared-kernel/calendar-date";
import { newId } from "@/src/shared-kernel/ids";
import { actAs, addMember, addProject, newCompany } from "@/test/companies";
import {
  addBillingAddress,
  addMaterial,
  addStore,
  addSupplier,
  addTerms,
} from "@/test/procurement";

import { POST as approvePr } from "../purchase-requests/[id]/approve/route";
import { POST as deletePr } from "../purchase-requests/[id]/delete/route";
import { GET as getPr } from "../purchase-requests/[id]/route";
import { POST as createPr } from "../purchase-requests/route";
import { POST as approve } from "./[id]/approve/route";
import { POST as close } from "./[id]/close/route";
import { POST as remove } from "./[id]/delete/route";
import { POST as markOrdered } from "./[id]/mark-ordered/route";
import { GET as pdf } from "./[id]/pdf/route";
import { POST as reject } from "./[id]/reject/route";
import { GET as getOne } from "./[id]/route";
import { POST as update } from "./[id]/update/route";
import { POST as bulkApprove } from "./bulk-approve/route";
import { GET as formOptions } from "./form-options/route";
import { GET as list, POST as create } from "./route";

vi.mock(import("@repo/auth/construction/server"), async (importOriginal) => ({
  ...(await importOriginal()),
  getCompanyAuthFromHeaders: vi.fn(),
}));

const BASE = "http://localhost/api/construction/procurement/purchase-orders";
const TODAY = todayIn("Asia/Kolkata");

type Po = {
  id: string;
  number: string;
  approvalStatus: string;
  stage: string;
  supplyType: string;
  placeOfSupplyStateCode: string | null;
  expectedDeliveryDate: string;
  updatedAt: string;
  closeReason: string | null;
  billing: { id: string; name: string; gstin: string | null };
  terms: { title: string; body: string }[];
  totals: { igstTotal: number; cgstTotal: number } & Record<string, number>;
  items: {
    cgst: number;
    sgst: number;
    igst: number;
    total: number;
    hsnCode: string | null;
    gstRate: string;
  }[];
  actions: Record<string, boolean>;
};

type Pr = {
  id: string;
  updatedAt: string;
  orderStatus: string;
  items: {
    id: string;
    materialId: string;
    orderedQty: string;
    pendingQty: string;
  }[];
};

const params = (id: string) => ({ params: Promise.resolve({ id }) });

function post(path: string, body: unknown, base = BASE): Request {
  return new Request(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const get = (path: string) => new Request(`${BASE}${path}`);

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function code(response: Response): Promise<string> {
  return (await json<{ code: string }>(response)).code;
}

async function setup() {
  const company = await newCompany();
  const ws = company.workspaceId;
  const by = company.ownerId;
  const projectId = await addProject(ws, by, "Tower A");
  await prisma.constructionProjectsProject.update({
    where: { id: projectId },
    data: { stateCode: "33" },
  });
  const cement = await addMaterial(ws, by, {
    name: "Cement OPC 53 Grade",
    unitRate: 38_500n,
    gstRate: "28",
    hsnCode: "2523",
  });
  const steel = await addMaterial(ws, by, {
    name: "TMT Steel Bar 12 mm",
    unitRate: 6_250n,
    gstRate: "18",
    hsnCode: "7214",
  });
  const supplierId = await addSupplier(ws, by, {
    name: "முருகன் டிரேடர்ஸ்",
    projectIds: [projectId],
  });
  const billingId = await addBillingAddress(ws, by, { isDefault: true });
  actAs({ userId: by, workspaceId: ws, role: "owner" });
  return { company, ws, by, projectId, cement, steel, supplierId, billingId };
}

type Ctx = Awaited<ReturnType<typeof setup>>;

function body(ctx: Ctx, patch: Record<string, unknown> = {}) {
  return {
    projectId: ctx.projectId,
    orderDate: TODAY,
    expectedDeliveryDate: addDays(TODAY, 5),
    supplierId: ctx.supplierId,
    items: [
      {
        materialId: ctx.cement.id,
        quantity: "100",
        unitRate: 38_500,
        gstRate: "28",
        hsnCode: "2523",
      },
      {
        materialId: ctx.steel.id,
        quantity: "1250.5",
        unitRate: 6_250,
        discount: { type: "percent", percent: "2" },
        gstRate: "18",
        hsnCode: "7214",
      },
    ],
    additionalCharges: 150_000,
    deductionAmount: 50_000,
    ...patch,
  };
}

async function raise(
  ctx: Ctx,
  patch: Record<string, unknown> = {},
): Promise<Response> {
  return create(post("", body(ctx, patch)));
}

async function approvedPr(
  ctx: Ctx,
  quantities: [string, string] = ["100", "500"],
): Promise<Pr> {
  const pr = await json<Pr>(
    await createPr(
      post(
        "",
        {
          projectId: ctx.projectId,
          requestDate: TODAY,
          requiredDate: addDays(TODAY, 9),
          approve: true,
          items: [
            { materialId: ctx.cement.id, quantity: quantities[0] },
            { materialId: ctx.steel.id, quantity: quantities[1] },
          ],
        },
        "http://localhost/api/construction/procurement/purchase-requests",
      ),
    ),
  );
  return pr;
}

async function readPr(id: string): Promise<Pr> {
  return json<Pr>(
    await getPr(
      new Request(
        `http://localhost/api/construction/procurement/purchase-requests/${id}`,
      ),
      params(id),
    ),
  );
}

function fromPr(pr: Pr, ctx: Ctx, quantities: [string, string]) {
  return pr.items.map((item, index) => ({
    materialId: item.materialId,
    purchaseRequestItemId: item.id,
    quantity: quantities[index],
    unitRate: item.materialId === ctx.cement.id ? 38_500 : 6_250,
    gstRate: "18",
  }));
}

describe("Purchase Orders", () => {
  it("prices CGST + SGST within the state and keeps the totals (golden)", async () => {
    const ctx = await setup();
    const response = await raise(ctx);
    expect(response.status).toBe(StatusCodes.CREATED);
    const po = await json<Po>(response);
    expect(po.number).toMatch(/^PO\//);
    expect(po).toMatchObject({
      approvalStatus: "pending",
      stage: "pending",
      supplyType: "intra_state",
      placeOfSupplyStateCode: "33",
    });
    expect(po.billing.id).toBe(ctx.billingId);
    expect(
      po.items.map((item) => [item.cgst, item.sgst, item.igst, item.total]),
    ).toEqual([
      [539_000, 539_000, 0, 4_928_000],
      [689_338, 689_338, 0, 9_037_988],
    ]);
    expect(po.totals).toEqual({
      subTotal: 11_665_625,
      discountTotal: 156_313,
      taxableTotal: 11_509_312,
      cgstTotal: 1_228_338,
      sgstTotal: 1_228_338,
      igstTotal: 0,
      itemsTotal: 13_965_988,
      additionalCharges: 150_000,
      deductionAmount: 50_000,
      grandTotal: 14_065_988,
    });
    const page = await json<{
      total: number;
      items: Po[];
      facets: { suppliers: { id: string }[] };
    }>(await list(get(`?projectId=${ctx.projectId}`)));
    expect(page.total).toBe(1);
    expect(page.facets.suppliers.map((s) => s.id)).toEqual([ctx.supplierId]);
  });

  it("charges IGST when the delivery state differs, or on override", async () => {
    const ctx = await setup();
    const inter = await json<Po>(
      await raise(ctx, {
        deliveryAddressDiffers: true,
        deliveryAddress: "Whitefield, Bengaluru",
        deliveryStateCode: "29",
      }),
    );
    expect(inter).toMatchObject({
      supplyType: "inter_state",
      placeOfSupplyStateCode: "29",
    });
    expect(inter.totals.igstTotal).toBe(2_456_676);
    expect(inter.totals.cgstTotal).toBe(0);
    const forced = await json<Po>(
      await raise(ctx, { supplyType: "inter_state" }),
    );
    expect(forced.supplyType).toBe("inter_state");
    const missing = await raise(ctx, { deliveryAddressDiffers: true });
    expect(await code(missing)).toBe("DELIVERY_ADDRESS_REQUIRED");
  });

  it("refuses suppliers off the Project, inactive ones, bad POCs and dates", async () => {
    const ctx = await setup();
    const offProject = await addSupplier(ctx.ws, ctx.by, { projectIds: [] });
    expect(await code(await raise(ctx, { supplierId: offProject }))).toBe(
      "SUPPLIER_NOT_ON_PROJECT",
    );
    const inactive = await addSupplier(ctx.ws, ctx.by, {
      projectIds: [ctx.projectId],
      isActive: false,
    });
    expect(await code(await raise(ctx, { supplierId: inactive }))).toBe(
      "SUPPLIER_INACTIVE",
    );
    expect(await code(await raise(ctx, { supplierId: newId() }))).toBe(
      "SUPPLIER_NOT_FOUND",
    );
    expect(
      await code(
        await raise(ctx, { sitePoc: { name: "Murugan", mobile: "12345" } }),
      ),
    ).toBe("MOBILE_INVALID");
    expect(
      await code(
        await raise(ctx, { expectedDeliveryDate: addDays(TODAY, -1) }),
      ),
    ).toBe("EXPECTED_DELIVERY_BEFORE_ORDER_DATE");
    expect(await code(await raise(ctx, { expectedDeliveryDate: null }))).toBe(
      "EXPECTED_DELIVERY_DATE_REQUIRED",
    );
    const bad = await raise(ctx, {
      items: [
        {
          materialId: ctx.cement.id,
          quantity: "1",
          unitRate: 100,
          discount: { type: "amount", paise: 500 },
        },
      ],
    });
    expect(await code(bad)).toBe("DISCOUNT_TOO_LARGE");
    await prisma.constructionOrganizationBillingAddress.updateMany({
      where: { workspaceId: ctx.ws },
      data: { isDefault: false },
    });
    expect(await code(await raise(ctx))).toBe("BILLING_ADDRESS_REQUIRED");
  });

  it("copies Terms & Conditions; editing the master leaves the PO alone", async () => {
    const ctx = await setup();
    const termsId = await addTerms(ctx.ws, ctx.by, "Delivery");
    const po = await json<Po>(await raise(ctx, { termsIds: [termsId] }));
    expect(po.terms).toEqual([
      {
        termsId,
        title: "Delivery",
        body: "Material to be delivered at site between 9 am and 6 pm.",
      },
    ]);
    await prisma.constructionMastersTermsCondition.update({
      where: { id: termsId },
      data: { body: "Changed" },
    });
    const again = await json<Po>(await getOne(get(`/${po.id}`), params(po.id)));
    expect(again.terms[0]?.body).toBe(
      "Material to be delivered at site between 9 am and 6 pm.",
    );
    expect(await code(await raise(ctx, { termsIds: [newId()] }))).toBe(
      "TERMS_NOT_FOUND",
    );
  });

  it("follows approval, edit, Mark as Ordered and Close", async () => {
    const ctx = await setup();
    const po = await json<Po>(await raise(ctx));
    expect(
      await code(
        await markOrdered(post(`/${po.id}/mark-ordered`, {}), params(po.id)),
      ),
    ).toBe("PURCHASE_ORDER_NOT_ORDERABLE");
    const approved = await json<Po>(
      await approve(post(`/${po.id}/approve`, {}), params(po.id)),
    );
    expect(approved.approvalStatus).toBe("approved");
    // Editing an approved, not-yet-ordered PO sends it back to pending.
    const edited = await json<Po>(
      await update(
        post(`/${po.id}/update`, {
          ...body(ctx),
          expectedUpdatedAt: approved.updatedAt,
        }),
        params(po.id),
      ),
    );
    expect(edited.approvalStatus).toBe("pending");
    const stale = await update(
      post(`/${po.id}/update`, {
        ...body(ctx),
        expectedUpdatedAt: approved.updatedAt,
      }),
      params(po.id),
    );
    expect(await code(stale)).toBe("PURCHASE_ORDER_CHANGED");
    const reapproved = await json<Po>(
      await update(
        post(`/${po.id}/update`, {
          ...body(ctx),
          approve: true,
          expectedUpdatedAt: edited.updatedAt,
        }),
        params(po.id),
      ),
    );
    expect(reapproved.approvalStatus).toBe("approved");
    const ordered = await json<Po>(
      await markOrdered(post(`/${po.id}/mark-ordered`, {}), params(po.id)),
    );
    expect(ordered.stage).toBe("ordered");
    expect(ordered.actions).toMatchObject({
      edit: false,
      close: true,
      markOrdered: false,
    });
    const locked = await update(
      post(`/${po.id}/update`, {
        ...body(ctx),
        expectedUpdatedAt: ordered.updatedAt,
      }),
      params(po.id),
    );
    expect(await code(locked)).toBe("PURCHASE_ORDER_NOT_EDITABLE");
    expect(
      await code(
        await close(post(`/${po.id}/close`, { reason: " " }), params(po.id)),
      ),
    ).toBe("CLOSE_REASON_REQUIRED");
    const closed = await json<Po>(
      await close(
        post(`/${po.id}/close`, { reason: "Supplier short of stock" }),
        params(po.id),
      ),
    );
    expect(closed).toMatchObject({
      stage: "closed",
      closeReason: "Supplier short of stock",
    });
    expect(
      await code(
        await close(
          post(`/${po.id}/close`, { reason: "again" }),
          params(po.id),
        ),
      ),
    ).toBe("PURCHASE_ORDER_NOT_CLOSABLE");
  });

  it("keeps the Purchase Request's fulfilment in step with its POs", async () => {
    const ctx = await setup();
    const pr = await approvedPr(ctx);
    const first = await json<Po>(
      await raise(ctx, {
        purchaseRequestId: pr.id,
        expectedDeliveryDate: null,
        items: fromPr(pr, ctx, ["40", "500"]),
      }),
    );
    // Expected Delivery Date defaults from the PR's Required Date.
    expect(first.expectedDeliveryDate).toBe(addDays(TODAY, 9));
    let read = await readPr(pr.id);
    expect(read.orderStatus).toBe("partially_ordered");
    expect(read.items.map((item) => item.pendingQty)).toEqual([
      "60.000",
      "0.000",
    ]);

    const options = await json<{
      purchaseRequests: { id: string; items: { pendingQty: string }[] }[];
    }>(await formOptions(get(`/form-options?projectId=${ctx.projectId}`)));
    expect(options.purchaseRequests.map((item) => item.id)).toEqual([pr.id]);

    const second = await json<Po>(
      await raise(ctx, {
        purchaseRequestId: pr.id,
        items: [fromPr(pr, ctx, ["60", "0"])[0]],
      }),
    );
    read = await readPr(pr.id);
    expect(read.orderStatus).toBe("ordered");
    // An ordered PR takes no new PO.
    expect(
      await code(
        await raise(ctx, {
          purchaseRequestId: pr.id,
          items: [fromPr(pr, ctx, ["1", "0"])[0]],
        }),
      ),
    ).toBe("PURCHASE_REQUEST_NOT_ORDERABLE");
    // Editing a linked PO above the request: excess ordered (a warning, not a block).
    const excess = await update(
      post(`/${second.id}/update`, {
        ...body(ctx, {
          purchaseRequestId: pr.id,
          items: [fromPr(pr, ctx, ["75", "0"])[0]],
        }),
        expectedUpdatedAt: second.updatedAt,
      }),
      params(second.id),
    );
    expect(excess.status).toBe(StatusCodes.OK);
    expect((await readPr(pr.id)).orderStatus).toBe("excess_ordered");
    // A rejected PO stops counting.
    await reject(
      post(`/${second.id}/reject`, { reason: "Rate too high" }),
      params(second.id),
    );
    read = await readPr(pr.id);
    expect(read.orderStatus).toBe("partially_ordered");
    expect(read.items[0]?.orderedQty).toBe("40.000");
    // The PR cannot be deleted while PO lines point at it.
    expect(
      await code(
        await deletePr(
          post(`/${pr.id}/delete`, { expectedUpdatedAt: read.updatedAt }),
          params(pr.id),
        ),
      ),
    ).toBe("PURCHASE_REQUEST_HAS_ORDERS");
    // Deleting a PO stops counting too.
    const live = await json<Po>(
      await getOne(get(`/${first.id}`), params(first.id)),
    );
    expect(
      (
        await remove(
          post(`/${first.id}/delete`, { expectedUpdatedAt: live.updatedAt }),
          params(first.id),
        )
      ).status,
    ).toBe(StatusCodes.NO_CONTENT);
    read = await readPr(pr.id);
    expect(read.orderStatus).toBe("not_ordered");
    // A line must be an item of the chosen PR.
    const other = await approvedPr(ctx);
    expect(
      await code(
        await raise(ctx, {
          purchaseRequestId: pr.id,
          items: [fromPr(other, ctx, ["1", "0"])[0]],
        }),
      ),
    ).toBe("PURCHASE_REQUEST_ITEM_NOT_FOUND");
    // A pending PR cannot be ordered against.
    const pending = await json<Pr>(
      await createPr(
        post(
          "",
          {
            projectId: ctx.projectId,
            requestDate: TODAY,
            items: [{ materialId: ctx.cement.id, quantity: "1" }],
          },
          "http://localhost/api/construction/procurement/purchase-requests",
        ),
      ),
    );
    expect(
      await code(
        await raise(ctx, {
          purchaseRequestId: pending.id,
          items: [fromPr(pending, ctx, ["1", "0"])[0]],
        }),
      ),
    ).toBe("PURCHASE_REQUEST_NOT_ORDERABLE");
    await approvePr(post(`/${pending.id}/approve`, {}), params(pending.id));
  });

  it("refuses deleting a PO a Goods Receipt points at", async () => {
    const ctx = await setup();
    const po = await json<Po>(await raise(ctx));
    await prisma.constructionProcurementGoodsReceipt.create({
      data: {
        id: newId(),
        workspaceId: ctx.ws,
        locationKind: "project",
        locationId: ctx.projectId,
        number: `GRN/${newId().slice(0, 6)}`,
        receiptDate: new Date(`${TODAY}T00:00:00.000Z`),
        inventoryDate: new Date(`${TODAY}T00:00:00.000Z`),
        supplierId: ctx.supplierId,
        supplierName: "Supplier",
        purchaseOrderId: po.id,
        createdBy: ctx.by,
        updatedBy: ctx.by,
      },
    });
    const refused = await remove(
      post(`/${po.id}/delete`, { expectedUpdatedAt: po.updatedAt }),
      params(po.id),
    );
    expect(refused.status).toBe(StatusCodes.CONFLICT);
    expect(await code(refused)).toBe("PURCHASE_ORDER_HAS_RECEIPTS");
  });

  it("bulk approves all or none", async () => {
    const ctx = await setup();
    const a = await json<Po>(await raise(ctx));
    const b = await json<Po>(await raise(ctx));
    await reject(
      post(`/${b.id}/reject`, { reason: "Wrong supplier" }),
      params(b.id),
    );
    const refused = await bulkApprove(
      post("/bulk-approve", { projectId: ctx.projectId, ids: [a.id, b.id] }),
    );
    expect(await code(refused)).toBe("BULK_DECISION_REFUSED");
    expect(
      (await json<Po>(await getOne(get(`/${a.id}`), params(a.id))))
        .approvalStatus,
    ).toBe("pending");
    expect(
      await json(
        await bulkApprove(
          post("/bulk-approve", { projectId: ctx.projectId, ids: [a.id] }),
        ),
      ),
    ).toEqual({ decided: 1 });
  });

  it("raises a Store PO with the Store's suppliers", async () => {
    const ctx = await setup();
    const storeId = await addStore(ctx.ws, ctx.by, [ctx.projectId], {
      stateCode: "29",
    });
    const storePo = (patch: Record<string, unknown> = {}) =>
      create(
        post("", { ...body(ctx), projectId: undefined, storeId, ...patch }),
      );
    expect(await code(await storePo())).toBe("SUPPLIER_NOT_ON_STORE");
    await prisma.constructionProcurementStoreSupplier.create({
      data: { storeId, supplierId: ctx.supplierId },
    });
    const response = await storePo();
    expect(response.status).toBe(StatusCodes.CREATED);
    const po = await json<Po>(response);
    // Supplier in Tamil Nadu, Store in Karnataka.
    expect(po).toMatchObject({
      supplyType: "inter_state",
      placeOfSupplyStateCode: "29",
    });
    const page = await json<{ total: number }>(
      await list(get(`?storeId=${storeId}`)),
    );
    expect(page.total).toBe(1);
    expect(await code(await create(post("", { ...body(ctx), storeId })))).toBe(
      "LOCATION_REQUIRED",
    );
  });

  it("needs the flags and hides other Companies' POs", async () => {
    const ctx = await setup();
    const po = await json<Po>(await raise(ctx));
    const reader = await addMember(ctx.ws, ctx.by, {
      "procurement.purchase_orders": ["read"],
    });
    await prisma.constructionOrganizationTeamMemberProject.create({
      data: { memberId: reader.memberId, projectId: ctx.projectId },
    });
    actAs({ userId: reader.userId, workspaceId: ctx.ws, role: "member" });
    expect((await getOne(get(`/${po.id}`), params(po.id))).status).toBe(
      StatusCodes.OK,
    );
    expect((await raise(ctx)).status).toBe(StatusCodes.FORBIDDEN);
    expect(
      (await approve(post(`/${po.id}/approve`, {}), params(po.id))).status,
    ).toBe(StatusCodes.FORBIDDEN);
    expect((await pdf(get(`/${po.id}/pdf`), params(po.id))).status).toBe(
      StatusCodes.FORBIDDEN,
    );
    const other = await newCompany("Other Builders");
    actAs({
      userId: other.ownerId,
      workspaceId: other.workspaceId,
      role: "owner",
    });
    expect((await getOne(get(`/${po.id}`), params(po.id))).status).toBe(
      StatusCodes.NOT_FOUND,
    );
  });

  it("prints the PO PDF with a Tamil supplier name", async () => {
    const ctx = await setup();
    const termsId = await addTerms(ctx.ws, ctx.by, "Payment");
    const po = await json<Po>(
      await raise(ctx, {
        termsIds: [termsId],
        paymentTermsDays: 30,
        supplierPoc: { name: "முருகன்", mobile: "77081 65767" },
      }),
    );
    const response = await pdf(get(`/${po.id}/pdf`), params(po.id));
    expect(response.status).toBe(StatusCodes.OK);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).toMatch(
      /^attachment; filename="PO-/,
    );
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    const loaded = await PDFDocument.load(bytes);
    const fonts = loaded.context
      .enumerateIndirectObjects()
      .flatMap(([, object]) =>
        object instanceof PDFDict &&
        object.get(PDFName.of("Type")) === PDFName.of("Font")
          ? [String(object.get(PDFName.of("BaseFont")))]
          : [],
      )
      .join(" ");
    expect(fonts).toContain("NotoSansTamil");
  });

  it("serves the form options and is on /api/docs", async () => {
    const ctx = await setup();
    const options = await json<{
      location: { stateCode: string | null };
      suppliers: { id: string }[];
      billingAddresses: unknown[];
    }>(await formOptions(get(`/form-options?projectId=${ctx.projectId}`)));
    expect(options.location.stateCode).toBe("33");
    expect(options.suppliers.map((s) => s.id)).toEqual([ctx.supplierId]);
    expect(options.billingAddresses).toHaveLength(1);
    const document = await json<{ paths: Record<string, unknown> }>(
      getOpenApi(),
    );
    for (const path of [
      "/api/construction/procurement/purchase-orders",
      "/api/construction/procurement/purchase-orders/form-options",
      "/api/construction/procurement/purchase-orders/{id}/close",
      "/api/construction/procurement/purchase-orders/{id}/pdf",
      "/api/construction/procurement/purchase-orders/bulk-reject",
    ])
      expect(document.paths[path], path).toBeDefined();
  });
});
