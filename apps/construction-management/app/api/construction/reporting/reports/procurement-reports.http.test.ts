import { prisma } from "@repo/construction-db";
import ExcelJS from "exceljs";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it, vi } from "vitest";

import { GET as currentInventory } from "@/app/api/construction/procurement/inventory/route";
import type { Flag } from "@/src/shared-kernel/access";
import { addDays, todayIn } from "@/src/shared-kernel/calendar-date";
import { dashboardLabourAttendance } from "@/test/dashboard-documents";
import { actAs, addMember, addProject, newCompany } from "@/test/companies";
import { bytesOf } from "@/test/files";
import {
  addMaterial,
  addMaterialCategory,
  addOpeningStock,
  addStore,
  addSupplier,
} from "@/test/procurement";
import { addPurchaseOrder } from "@/test/procurement-orders";
import {
  reportConsumption,
  reportGoodsReceipt,
  reportPurchaseRequest,
  reportTransfer,
} from "@/test/procurement-reports";
import { TEST_ORIGIN } from "@/test/sessions";

import { GET as downloadReport } from "./[id]/download/route";
import type { ConstructionReportingReportJobResponseModel as Job } from "./report-models";
import { POST as requestReport } from "./route";

vi.mock(import("@repo/auth/construction/server"), async (importOriginal) => ({
  ...(await importOriginal()),
  getCompanyAuthFromHeaders: vi.fn(),
}));

const BASE = `${TEST_ORIGIN}/api/construction/reporting/reports`;
const TODAY = todayIn("Asia/Kolkata");
const PERIOD = { from: "2026-09-01", to: "2026-09-30" };

type Actor = { userId: string; workspaceId: string; role: "owner" | "member" };

function post(url: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function request(actor: Actor, body: unknown) {
  actAs(actor);
  return requestReport(post(BASE, body));
}

async function generate(actor: Actor, body: unknown): Promise<Job> {
  const response = await request(actor, body);
  expect(response.status).toBe(StatusCodes.CREATED);
  const job = (await response.json()) as Job;
  expect(job.error).toBeNull();
  expect(job.status).toBe("done");
  return job;
}

async function download(actor: Actor, job: Job, format: "xlsx" | "pdf") {
  actAs(actor);
  return downloadReport(
    new Request(`${BASE}/${job.id}/download?format=${format}`),
    { params: Promise.resolve({ id: job.id }) },
  );
}

async function workbook(actor: Actor, job: Job): Promise<ExcelJS.Workbook> {
  const response = await download(actor, job, "xlsx");
  expect(response.status).toBe(StatusCodes.OK);
  const book = new ExcelJS.Workbook();
  const bytes = Buffer.from(await bytesOf(response));
  await book.xlsx.load(bytes as unknown as ExcelJS.Buffer);
  return book;
}

async function pdfOk(actor: Actor, job: Job) {
  const response = await download(actor, job, "pdf");
  expect(response.status).toBe(StatusCodes.OK);
  const bytes = await bytesOf(response);
  expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
}

function rowsOf(sheet: ExcelJS.Worksheet | undefined): unknown[][] {
  const rows: unknown[][] = [];
  sheet?.eachRow({ includeEmpty: true }, (row, number) => {
    rows[number - 1] = (row.values as unknown[]).slice(1);
  });
  return Array.from(rows, (row: unknown[] | undefined) => row ?? []);
}

/** The table whose header starts with `first` (and `second`, past the header block's "Project" line). */
function tableOf(
  sheet: ExcelJS.Worksheet | undefined,
  first: string,
  second?: string,
) {
  const rows = rowsOf(sheet);
  const headerIndex = rows.findIndex(
    (row) => row[0] === first && (second == null || row[1] === second),
  );
  const header = (rows[headerIndex] ?? []) as string[];
  const body = rows.slice(headerIndex + 1);
  const totalsIndex = body.findIndex((row) => row[0] === "Total");
  const lines = totalsIndex < 0 ? body : body.slice(0, totalsIndex);
  const cell = (row: unknown[] | undefined, label: string) =>
    row?.[header.indexOf(label)];
  const find = (value: string) =>
    lines.find((row) =>
      row.some((item) => typeof item === "string" && item.includes(value)),
    );
  const text = rows
    .flat()
    .filter((item) => typeof item === "string")
    .join(" | ");
  return { header, lines, cell, find, text };
}

async function setup() {
  const company = await newCompany();
  const ws = company.workspaceId;
  const by = company.ownerId;
  const owner: Actor = { userId: by, workspaceId: ws, role: "owner" };
  const tower = await addProject(ws, by, "Tower A");
  const villa = await addProject(ws, by, "Villa Phase 2");
  const store = await addStore(ws, by, [tower], {
    name: "Central Store Ambattur",
  });
  const cement = await addMaterial(ws, by, { name: "Cement PPC Bulk" });
  const member = async (
    grants: Record<string, Flag[]>,
    projects: readonly string[] = [tower],
  ) => {
    const added = await addMember(ws, by, grants);
    for (const projectId of projects)
      await prisma.constructionOrganizationTeamMemberProject.create({
        data: { memberId: added.memberId, projectId },
      });
    return {
      memberId: added.memberId,
      actor: { userId: added.userId, workspaceId: ws, role: "member" } as Actor,
    };
  };
  const line = (quantity: string, extra: { categoryId?: string } = {}) => ({
    materialId: cement.id,
    materialName: cement.name,
    uomId: cement.uomId,
    quantity,
    ...extra,
  });
  return { ws, by, owner, tower, villa, store, cement, member, line };
}

const CENTRAL_READ = { "reporting.central_reports": ["read"] as Flag[] };

describe("procurement reports HTTP (CM-903)", () => {
  it("Purchase Requests: one row per material with status and order status; another Project's never appear; filters apply", async () => {
    const ctx = await setup();
    const cementCategory = await addMaterialCategory(ctx.ws, ctx.by, "Cement");
    const sand = await addMaterial(ctx.ws, ctx.by, { name: "River sand" });
    const approved = await reportPurchaseRequest(ctx.ws, ctx.by, {
      projectId: ctx.tower,
      requestDate: "2026-09-05",
      requiredDate: "2026-09-12",
      approvalStatus: "approved",
      lines: [
        ctx.line("120", { categoryId: cementCategory }),
        {
          materialId: sand.id,
          materialName: sand.name,
          uomId: sand.uomId,
          quantity: "300",
        },
      ],
    });
    await reportPurchaseRequest(ctx.ws, ctx.by, {
      projectId: ctx.tower,
      requestDate: "2026-09-08",
      lines: [ctx.line("40")],
    });
    // Out of the period, deleted, and on another Project: never printed.
    await reportPurchaseRequest(ctx.ws, ctx.by, {
      projectId: ctx.tower,
      requestDate: "2026-08-20",
      lines: [ctx.line("1")],
    });
    await reportPurchaseRequest(ctx.ws, ctx.by, {
      projectId: ctx.tower,
      requestDate: "2026-09-09",
      deleted: true,
      lines: [ctx.line("2")],
    });
    const villa = await reportPurchaseRequest(ctx.ws, ctx.by, {
      projectId: ctx.villa,
      requestDate: "2026-09-09",
      lines: [ctx.line("3")],
    });
    const site = await ctx.member({
      "procurement.purchase_requests": ["read", "report"],
    });

    const job = await generate(site.actor, {
      kind: "purchase_requests",
      projectId: ctx.tower,
      params: PERIOD,
    });
    expect(job.title).toBe("Purchase Requests");
    expect(job.includesMoney).toBe(false);
    const book = await workbook(site.actor, job);
    const table = tableOf(book.worksheets[0], "PR No.");
    expect(table.header).toEqual([
      "PR No.",
      "Request Date",
      "Material",
      "Category",
      "Quantity",
      "Ordered",
      "Unit",
      "Required By",
      "Location",
      "Status",
      "Order Status",
      "Created By",
      "Decided By",
      "Remark",
    ]);
    expect(table.lines).toHaveLength(3);
    const first = table.find("River sand");
    expect(table.cell(first, "PR No.")).toBe(approved.number);
    expect(table.cell(first, "Quantity")).toBe(300);
    expect(table.cell(first, "Status")).toBe("Approved");
    expect(table.cell(first, "Order Status")).toBe("Not ordered");
    expect(table.cell(first, "Required By")).toBe("12 Sep 2026");
    expect(table.cell(first, "Created By")).toBe("Arun Selva Kumar");
    expect(table.text).not.toContain(villa.number);
    await pdfOk(site.actor, job);

    const pending = await generate(site.actor, {
      kind: "purchase_requests",
      projectId: ctx.tower,
      params: { ...PERIOD, status: "pending" },
    });
    const pendingRows = tableOf(
      (await workbook(site.actor, pending)).worksheets[0],
      "PR No.",
    );
    expect(pendingRows.lines).toHaveLength(1);
    expect(pendingRows.text).toContain("Filtered by Status: Pending.");

    const byCategory = await generate(site.actor, {
      kind: "purchase_requests",
      projectId: ctx.tower,
      params: { ...PERIOD, materialCategoryId: cementCategory },
    });
    const categoryRows = tableOf(
      (await workbook(site.actor, byCategory)).worksheets[0],
      "PR No.",
    );
    expect(categoryRows.lines).toHaveLength(1);
    expect(categoryRows.cell(categoryRows.lines[0], "Category")).toBe("Cement");

    // Without Report on the menu, or off the Project: refused.
    const reader = await ctx.member({
      "procurement.purchase_requests": ["read"],
    });
    expect(
      (
        await request(reader.actor, {
          kind: "purchase_requests",
          projectId: ctx.tower,
          params: PERIOD,
        })
      ).status,
    ).toBe(StatusCodes.FORBIDDEN);
    expect(
      (
        await request(site.actor, {
          kind: "purchase_requests",
          projectId: ctx.villa,
          params: PERIOD,
        })
      ).status,
    ).toBe(StatusCodes.FORBIDDEN);
  });

  it("Purchase Orders: amounts with GST on Report alone; central covers the member's Projects and the Stores, or only the chosen Projects", async () => {
    const ctx = await setup();
    const supplierId = await addSupplier(ctx.ws, ctx.by, {
      name: "Sri Murugan Traders",
    });
    const lines = [
      {
        materialId: ctx.cement.id,
        uomId: ctx.cement.uomId,
        quantity: "100",
        unitRate: 400_00n,
        gstRate: "18",
      },
    ];
    const tower = await addPurchaseOrder(ctx.ws, ctx.by, {
      location: { kind: "project", id: ctx.tower },
      supplierId,
      lines,
    });
    const store = await addPurchaseOrder(ctx.ws, ctx.by, {
      location: { kind: "store", id: ctx.store },
      supplierId,
      lines,
    });
    const villa = await addPurchaseOrder(ctx.ws, ctx.by, {
      location: { kind: "project", id: ctx.villa },
      supplierId,
      lines,
    });
    const buyer = await ctx.member({
      "procurement.purchase_orders": ["read", "report"],
      ...CENTRAL_READ,
    });

    const project = await generate(buyer.actor, {
      kind: "purchase_orders",
      projectId: ctx.tower,
      params: PERIOD,
    });
    expect(project.includesMoney).toBe(true);
    const book = await workbook(buyer.actor, project);
    const orders = tableOf(book.worksheets[0], "PO No.");
    expect(orders.header).toEqual([
      "PO No.",
      "PO Date",
      "Supplier",
      "PR No.",
      "Expected Delivery",
      "Status",
      "Receipt Status",
      "Lines",
      "Taxable",
      "CGST",
      "SGST",
      "IGST",
      "Total",
    ]);
    expect(orders.lines).toHaveLength(1);
    const row = orders.find(tower.number);
    expect(orders.cell(row, "Taxable")).toBe(40_000);
    expect(orders.cell(row, "CGST")).toBe(3_600);
    expect(orders.cell(row, "Total")).toBe(47_200);
    expect(orders.cell(row, "Receipt Status")).toBe("Not received");
    const orderLines = tableOf(book.worksheets[1], "PO No.");
    expect(orderLines.cell(orderLines.lines[0], "Ordered")).toBe(100);
    expect(orderLines.cell(orderLines.lines[0], "Pending")).toBe(100);
    await pdfOk(buyer.actor, project);

    // Central: the member's Projects (Tower) and the Stores, not Villa.
    const central = await generate(buyer.actor, {
      kind: "purchase_orders",
      projectId: null,
      params: PERIOD,
    });
    const all = tableOf(
      (await workbook(buyer.actor, central)).worksheets[0],
      "PO No.",
    );
    expect(all.header).toContain("Project / Store");
    expect(all.lines).toHaveLength(2);
    expect(all.cell(all.find(store.number), "Project / Store")).toBe(
      "Central Store Ambattur",
    );
    expect(all.text).not.toContain(villa.number);

    // Chosen Projects: only those among the member's, no Stores.
    const chosen = await generate(buyer.actor, {
      kind: "purchase_orders",
      projectId: null,
      params: { ...PERIOD, projectIds: [ctx.tower, ctx.villa] },
    });
    // The job keeps the chosen Projects the member may see.
    expect(chosen.params.projectIds).toEqual([ctx.tower]);
    const picked = tableOf(
      (await workbook(buyer.actor, chosen)).worksheets[0],
      "PO No.",
    );
    expect(picked.lines).toHaveLength(1);
    expect(picked.cell(picked.lines[0], "PO No.")).toBe(tower.number);

    // The Owner's chosen Project.
    const owner = await generate(ctx.owner, {
      kind: "purchase_orders",
      projectId: null,
      params: { ...PERIOD, projectIds: [ctx.villa] },
    });
    const ownerRows = tableOf(
      (await workbook(ctx.owner, owner)).worksheets[0],
      "PO No.",
    );
    expect(ownerRows.lines.map((line) => line[0])).toEqual([villa.number]);
  });

  it("needs Central Reports Read for a central report, on top of the menu's Report", async () => {
    const ctx = await setup();
    const buyer = await ctx.member({
      "procurement.purchase_orders": ["read", "report"],
      "labour.vendor": ["read", "report"],
    });
    for (const body of [
      { kind: "purchase_orders", projectId: null, params: PERIOD },
      { kind: "vendor_attendance", projectId: null, params: PERIOD },
    ]) {
      const response = await request(buyer.actor, body);
      expect(response.status, body.kind).toBe(StatusCodes.FORBIDDEN);
      expect(((await response.json()) as { message: string }).message).toMatch(
        /Central Reports Read/,
      );
    }
    // The Project's own report never needs it.
    await generate(buyer.actor, {
      kind: "purchase_orders",
      projectId: ctx.tower,
      params: PERIOD,
    });
    // Central Reports Read alone is not enough.
    const viewer = await ctx.member(CENTRAL_READ);
    expect(
      (
        await request(viewer.actor, {
          kind: "purchase_orders",
          projectId: null,
          params: PERIOD,
        })
      ).status,
    ).toBe(StatusCodes.FORBIDDEN);
    // Central Payment's and Equipments' own reports keep their gate.
    const equipments = await ctx.member({
      "masters.equipments": ["read", "report"],
    });
    await generate(equipments.actor, {
      kind: "equipment_transfers",
      projectId: null,
      params: PERIOD,
    });
  });

  it("Material Received: amounts only with Financial; without View all only the member's own receipts", async () => {
    const ctx = await setup();
    const supplierId = await addSupplier(ctx.ws, ctx.by, {
      name: "Sri Murugan Traders",
    });
    const storeKeeper = await ctx.member({
      "procurement.material_received": ["read", "report", "create"],
    });
    const theirs = await reportGoodsReceipt(ctx.ws, storeKeeper.actor.userId, {
      location: { kind: "project", id: ctx.tower },
      supplierId,
      supplierName: "Sri Murugan Traders",
      receiptDate: "2026-09-10",
      invoiceNo: "INV-901",
      lines: [{ ...ctx.line("60"), unitRate: 400_00n }],
    });
    const owners = await reportGoodsReceipt(ctx.ws, ctx.by, {
      location: { kind: "project", id: ctx.tower },
      supplierId,
      supplierName: "Sri Murugan Traders",
      receiptDate: "2026-09-11",
      lines: [ctx.line("10")],
    });
    const villa = await reportGoodsReceipt(ctx.ws, ctx.by, {
      location: { kind: "project", id: ctx.villa },
      supplierId,
      supplierName: "Sri Murugan Traders",
      receiptDate: "2026-09-11",
      lines: [ctx.line("5")],
    });

    // Without Financial or View all: no amounts, own receipts only.
    const own = await generate(storeKeeper.actor, {
      kind: "material_received",
      projectId: ctx.tower,
      params: PERIOD,
    });
    expect(own.includesMoney).toBe(false);
    const ownBook = await workbook(storeKeeper.actor, own);
    const ownRows = tableOf(ownBook.worksheets[0], "GRN No.");
    expect(ownRows.header).not.toContain("Taxable");
    expect(ownRows.header).not.toContain("Total");
    expect(ownRows.lines.map((line) => line[0])).toEqual([theirs.number]);
    expect(ownRows.cell(ownRows.lines[0], "Invoice No.")).toBe("INV-901");
    expect(ownRows.text).toContain("Only the receipts you entered");
    expect(tableOf(ownBook.worksheets[1], "GRN No.").header).not.toContain(
      "Rate",
    );

    // With Financial and View all: every receipt of the Project, with value.
    const accountant = await ctx.member({
      "procurement.material_received": [
        "read",
        "report",
        "financial",
        "view_all",
      ],
    });
    const full = await generate(accountant.actor, {
      kind: "material_received",
      projectId: ctx.tower,
      params: PERIOD,
    });
    expect(full.includesMoney).toBe(true);
    const fullRows = tableOf(
      (await workbook(accountant.actor, full)).worksheets[0],
      "GRN No.",
    );
    expect(fullRows.lines).toHaveLength(2);
    expect(fullRows.cell(fullRows.find(theirs.number), "Taxable")).toBe(24_000);
    expect(fullRows.cell(fullRows.find(theirs.number), "Total")).toBe(28_320);
    expect(fullRows.text).not.toContain(villa.number);
    expect(fullRows.find(owners.number)).toBeDefined();

    // Someone else's own-only report is not theirs to open without View all.
    const other = await ctx.member({
      "procurement.material_received": ["read", "report", "financial"],
    });
    expect((await download(other.actor, full, "xlsx")).status).toBe(
      StatusCodes.FORBIDDEN,
    );
  });

  it("Material Transfers: the legacy columns, either side on the Project, status and type filters; central by chosen Projects", async () => {
    const ctx = await setup();
    const sent = await reportTransfer(ctx.ws, ctx.by, {
      from: { kind: "project", id: ctx.tower },
      to: { kind: "store", id: ctx.store },
      transferDate: "2026-09-12",
      approvalStatus: "approved",
      deliveredOn: "2026-09-13",
      receiverName: "Kumar",
      lines: [ctx.line("10")],
    });
    const incoming = await reportTransfer(ctx.ws, ctx.by, {
      from: { kind: "project", id: ctx.villa },
      to: { kind: "project", id: ctx.tower },
      transferDate: "2026-09-14",
      lines: [ctx.line("4")],
    });
    const elsewhere = await reportTransfer(ctx.ws, ctx.by, {
      from: { kind: "store", id: ctx.store },
      to: { kind: "project", id: ctx.villa },
      transferDate: "2026-09-15",
      approvalStatus: "approved",
      lines: [ctx.line("2")],
    });
    const site = await ctx.member({
      "procurement.material_transfers": ["read", "report"],
      ...CENTRAL_READ,
    });

    const job = await generate(site.actor, {
      kind: "material_transfers",
      projectId: ctx.tower,
      params: PERIOD,
    });
    const table = tableOf(
      (await workbook(site.actor, job)).worksheets[0],
      "Transfer No.",
    );
    expect(table.header).toEqual([
      "Transfer No.",
      "Transfer Date",
      "Type",
      "From",
      "To",
      "Status",
      "Sent By",
      "Received By",
      "Delivered On",
      "Lines",
      "Remark",
    ]);
    expect(table.lines).toHaveLength(2);
    const out = table.find(sent.number);
    expect(table.cell(out, "Type")).toBe("Project to Store");
    expect(table.cell(out, "To")).toBe("Central Store Ambattur");
    expect(table.cell(out, "Status")).toBe("Delivered");
    expect(table.cell(out, "Received By")).toBe("Kumar");
    expect(table.cell(out, "Sent By")).toBe("Arun Selva Kumar");
    expect(table.cell(table.find(incoming.number), "Status")).toBe("Pending");
    expect(table.text).not.toContain(elsewhere.number);
    await pdfOk(site.actor, job);

    const delivered = await generate(site.actor, {
      kind: "material_transfers",
      projectId: ctx.tower,
      params: {
        ...PERIOD,
        status: "delivered",
        transferType: "project_to_store",
      },
    });
    const deliveredRows = tableOf(
      (await workbook(site.actor, delivered)).worksheets[0],
      "Transfer No.",
    );
    expect(deliveredRows.lines.map((line) => line[0])).toEqual([sent.number]);

    // Central without Central store Read: the member's Projects' transfers
    // only (a Store side needs it); chosen Projects narrow further.
    const central = await generate(site.actor, {
      kind: "material_transfers",
      projectId: null,
      params: { ...PERIOD, projectIds: [ctx.tower] },
    });
    const centralRows = tableOf(
      (await workbook(site.actor, central)).worksheets[0],
      "Transfer No.",
    );
    expect(centralRows.lines.map((line) => line[0]).sort()).toEqual(
      [sent.number, incoming.number].sort(),
    );
    expect(centralRows.text).toContain("Covers the Projects you chose.");
  });

  it("Stock Register: the screen's figures, so closing on today equals Current Inventory; central by Store", async () => {
    const ctx = await setup();
    const tower = { kind: "project" as const, id: ctx.tower };
    const store = { kind: "store" as const, id: ctx.store };
    await addOpeningStock(
      ctx.ws,
      ctx.by,
      tower,
      ctx.cement.id,
      "100",
      addDays(TODAY, -40),
    );
    await reportConsumption(
      ctx.ws,
      ctx.by,
      tower,
      ctx.cement.id,
      "30",
      addDays(TODAY, -5),
    );
    await addOpeningStock(
      ctx.ws,
      ctx.by,
      store,
      ctx.cement.id,
      "500",
      addDays(TODAY, -40),
    );
    await addOpeningStock(
      ctx.ws,
      ctx.by,
      { kind: "project", id: ctx.villa },
      ctx.cement.id,
      "9",
      addDays(TODAY, -40),
    );
    const keeper = await ctx.member({
      "procurement.current_inventory": ["read", "report"],
      "procurement.central_store": ["read"],
      ...CENTRAL_READ,
    });
    const range = { from: addDays(TODAY, -20), to: TODAY };

    const job = await generate(keeper.actor, {
      kind: "stock_register",
      projectId: ctx.tower,
      params: range,
    });
    const table = tableOf(
      (await workbook(keeper.actor, job)).worksheets[0],
      "Material",
    );
    expect(table.header).toEqual([
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
    const row = table.find("Cement PPC Bulk");
    expect(table.cell(row, "Opening")).toBe(100);
    expect(table.cell(row, "Consumed")).toBe(30);
    expect(table.cell(row, "Closing")).toBe(70);
    await pdfOk(keeper.actor, job);

    actAs(keeper.actor);
    const screen = await currentInventory(
      new Request(
        `${TEST_ORIGIN}/api/construction/procurement/inventory?locationKind=project&locationId=${ctx.tower}`,
      ),
    );
    expect(screen.status).toBe(StatusCodes.OK);
    const inventory = (await screen.json()) as {
      items: { materialId: string; inStock: string }[];
    };
    const onScreen = inventory.items.find(
      (item) => item.materialId === ctx.cement.id,
    );
    expect(Number(onScreen?.inStock)).toBe(table.cell(row, "Closing"));

    // Central: the member's Project and the Store, not Villa.
    const central = await generate(keeper.actor, {
      kind: "stock_register",
      projectId: null,
      params: range,
    });
    const all = tableOf(
      (await workbook(keeper.actor, central)).worksheets[0],
      "Project / Store",
    );
    expect(
      all.lines.map((line) => [line[0], all.cell(line, "Closing")]),
    ).toEqual([
      ["Central Store Ambattur", 500],
      ["Tower A", 70],
    ]);
    // The Store filter alone: that Store only.
    const byStore = await generate(keeper.actor, {
      kind: "stock_register",
      projectId: null,
      params: { ...range, storeId: ctx.store },
    });
    expect(byStore.params.storeId).toBe(ctx.store);
    const storeRows = tableOf(
      (await workbook(keeper.actor, byStore)).worksheets[0],
      "Project / Store",
    );
    expect(storeRows.lines.map((line) => line[0])).toEqual([
      "Central Store Ambattur",
    ]);
    expect(storeRows.text).toContain(
      "Covers the Store Central Store Ambattur.",
    );

    // A Store needs Central store Read.
    const siteOnly = await ctx.member({
      "procurement.current_inventory": ["read", "report"],
      ...CENTRAL_READ,
    });
    expect(
      (
        await request(siteOnly.actor, {
          kind: "stock_register",
          projectId: null,
          params: { ...range, storeId: ctx.store },
        })
      ).status,
    ).toBe(StatusCodes.FORBIDDEN);
    const projectsOnly = await generate(siteOnly.actor, {
      kind: "stock_register",
      projectId: null,
      params: range,
    });
    const projectRows = tableOf(
      (await workbook(siteOnly.actor, projectsOnly)).worksheets[0],
      "Project / Store",
    );
    expect(projectRows.lines.map((line) => line[0])).toEqual(["Tower A"]);
  });

  it("Central Labour Attendance: a row per Project and Labour, the member's Projects only, central only", async () => {
    const ctx = await setup();
    const today = TODAY;
    for (const [projectId, status] of [
      [ctx.tower, "present"],
      [ctx.tower, "half_day"],
      [ctx.villa, "present"],
    ] as const)
      await dashboardLabourAttendance(ctx.ws, ctx.by, {
        projectId,
        date: today,
        status,
      });
    const supervisor = await ctx.member({
      "labour.labour": ["read", "report"],
      ...CENTRAL_READ,
    });
    const range = { from: addDays(today, -7), to: today };

    const job = await generate(supervisor.actor, {
      kind: "labour_attendance_central",
      projectId: null,
      params: range,
    });
    expect(job.title).toBe("Central Labour Attendance");
    const book = await workbook(supervisor.actor, job);
    const byLabour = tableOf(book.worksheets[0], "Project", "Labour");
    expect(byLabour.header.slice(0, 5)).toEqual([
      "Project",
      "Labour",
      "Labour Id",
      "Category",
      "Present",
    ]);
    expect(byLabour.lines.map((line) => line[0])).toEqual([
      "Tower A",
      "Tower A",
    ]);
    const byProject = tableOf(book.worksheets[1], "Project", "Labours");
    expect(byProject.lines).toEqual([
      expect.arrayContaining(["Tower A", 2, 1, 1]),
    ]);
    expect(byLabour.text).toContain("the Projects you are on");
    await pdfOk(supervisor.actor, job);

    const owner = await generate(ctx.owner, {
      kind: "labour_attendance_central",
      projectId: null,
      params: { ...range, projectIds: [ctx.villa] },
    });
    const ownerRows = tableOf(
      (await workbook(ctx.owner, owner)).worksheets[0],
      "Project",
      "Labour",
    );
    expect(ownerRows.lines.map((line) => line[0])).toEqual(["Villa Phase 2"]);

    const onProject = await request(ctx.owner, {
      kind: "labour_attendance_central",
      projectId: ctx.tower,
      params: range,
    });
    expect(onProject.status).toBe(StatusCodes.BAD_REQUEST);
  });
});
