import { prisma } from "@repo/construction-db";
import ExcelJS from "exceljs";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it, vi } from "vitest";

import { actAs, addMember, addProject, newCompany } from "@/test/companies";
import { addLibraryItem, measureBoqItem } from "@/test/contracts";
import { unitNamed } from "@/test/procurement";
import { salesWing } from "@/test/sales";
import { sharedAssign } from "@/test/site-work";

import type { GetConstructionContractsBoqResponseModel } from "./boq-models";
import { GET as exportRoute } from "./export/route";
import { POST as importRoute } from "./import/route";
import { GET as boqRoute } from "./route";
import { GET as sampleRoute } from "./sample/route";

vi.mock(import("@repo/auth/construction/server"), async (importOriginal) => ({
  ...(await importOriginal()),
  getCompanyAuthFromHeaders: vi.fn(),
}));

const BASE = "http://localhost/api/construction/contracts/boq";
const XLSX =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const HEADERS = [
  "Section",
  "Item no",
  "Description",
  "UoM",
  "SAC/HSN",
  "Quantity",
  "Rate (₹)",
  "Wing / Location",
  "Library code",
] as const;

type ErrorBody = {
  code: string;
  details?: { errors?: { row: number; column: string; message: string }[] };
};

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function workbook(
  rows: unknown[][],
  headers: readonly string[] = HEADERS,
) {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet("BOQ");
  sheet.addRow([...headers]);
  for (const row of rows) sheet.addRow(row);
  return new Uint8Array(await book.xlsx.writeBuffer());
}

/** The first sheet of a downloaded workbook as rows of values. */
async function readBack(response: Response): Promise<unknown[][]> {
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(await response.arrayBuffer());
  const sheet = book.worksheets[0];
  const rows: unknown[][] = [];
  sheet?.eachRow((row) => {
    const values: unknown[] = [];
    for (let column = 1; column <= sheet.columnCount; column += 1)
      values.push(row.getCell(column).value ?? null);
    rows.push(values);
  });
  return rows;
}

async function setup() {
  const company = await newCompany();
  const ws = company.workspaceId;
  const by = company.ownerId;
  const owner = { userId: by, workspaceId: ws, role: "owner" as const };
  const projectId = await addProject(ws, by);
  const cum = await unitNamed(ws, by, "cum");
  await unitNamed(ws, by, "sqm");
  actAs(owner);
  const upload = (bytes: Uint8Array, project = projectId) =>
    importRoute(
      new Request(`${BASE}/import?projectId=${project}`, {
        method: "POST",
        headers: { "content-type": XLSX },
        body: Buffer.from(bytes),
      }),
    );
  const boq = async () =>
    json<GetConstructionContractsBoqResponseModel>(
      await boqRoute(new Request(`${BASE}?projectId=${projectId}`)),
    );
  return { ws, by, owner, projectId, cum, upload, boq };
}

describe("BOQ import (CM-1103)", () => {
  it("gives a sample with the columns, behind Import and Financial", async () => {
    const ctx = await setup();
    const sample = await sampleRoute(
      new Request(`${BASE}/sample?projectId=${ctx.projectId}`),
    );
    expect(sample.status).toBe(StatusCodes.OK);
    expect(sample.headers.get("content-type")).toBe(XLSX);
    const rows = await readBack(sample);
    expect(rows[0]).toEqual([...HEADERS]);
    expect(rows.length).toBeGreaterThan(1);

    const added = await addMember(ctx.ws, ctx.by, {
      "contracts.boq": ["read", "import"],
    });
    await sharedAssign(added.memberId, ctx.projectId);
    actAs({ userId: added.userId, workspaceId: ctx.ws, role: "member" });
    expect(
      (
        await sampleRoute(
          new Request(`${BASE}/sample?projectId=${ctx.projectId}`),
        )
      ).status,
    ).toBe(StatusCodes.FORBIDDEN);
    expect((await ctx.upload(await workbook([]))).status).toBe(
      StatusCodes.FORBIDDEN,
    );
    expect(
      (
        await exportRoute(
          new Request(`${BASE}/export?projectId=${ctx.projectId}`),
        )
      ).status,
    ).toBe(StatusCodes.FORBIDDEN);
  });

  it("adds sections in first-seen order and items, then updates by Item no", async () => {
    const ctx = await setup();
    const wing = await salesWing(ctx.ws, ctx.projectId, ctx.by, {
      name: "A Wing",
    });
    const result = await ctx.upload(
      await workbook([
        [
          "Earthwork",
          "1.1",
          "Excavation",
          "cum",
          "995411",
          450,
          285.5,
          "a wing",
          null,
        ],
        [
          "Concrete",
          "2.1",
          "PCC 1:4:8",
          "CUM",
          null,
          "32.5",
          "6,123.45",
          null,
          null,
        ],
        ["earthwork", "1.2", "Filling", "cum", null, 180, 165, null, null],
      ]),
    );
    expect(result.status).toBe(StatusCodes.OK);
    expect(await json(result)).toEqual({
      sectionsCreated: 2,
      created: 3,
      updated: 0,
      unchanged: 0,
    });
    let boq = await ctx.boq();
    expect(boq.sections.map((section) => section.title)).toEqual([
      "Earthwork",
      "Concrete",
    ]);
    expect(boq.sections[0]?.items.map((item) => item.itemNo)).toEqual([
      "1.1",
      "1.2",
    ]);
    expect(boq.sections[0]?.items[0]).toMatchObject({
      quantity: "450.0000",
      originalQuantity: "450.0000",
      rate: 285_50,
      wingId: wing.wingId,
      sacHsn: "995411",
    });
    expect(boq.sections[1]?.items[0]).toMatchObject({
      quantity: "32.5000",
      rate: 6_123_45,
    });

    // Again: one changed, one moved to a new section, one the same.
    const again = await ctx.upload(
      await workbook([
        [
          "Earthwork",
          "1.1",
          "Excavation",
          "cum",
          "995411",
          450,
          285.5,
          "A Wing",
          null,
        ],
        ["Concrete", "2.1", "PCC 1:4:8", "cum", null, 40, 6123.45, null, null],
        ["Filling", "1.2", "Filling", "cum", null, 180, 165, null, null],
      ]),
    );
    expect(await json(again)).toEqual({
      sectionsCreated: 1,
      created: 0,
      updated: 2,
      unchanged: 1,
    });
    boq = await ctx.boq();
    expect(boq.sections.map((section) => section.title)).toEqual([
      "Earthwork",
      "Concrete",
      "Filling",
    ]);
    expect(boq.sections[1]?.items[0]).toMatchObject({
      quantity: "40.0000",
      originalQuantity: "40.0000",
    });
    expect(boq.sections[2]?.items.map((item) => item.itemNo)).toEqual(["1.2"]);
    const audit = await prisma.constructionOrganizationAuditEvent.count({
      where: { workspaceId: ctx.ws, action: "boq.imported" },
    });
    expect(audit).toBe(2);
  });

  it("saves nothing when a row has a problem, and lists every problem", async () => {
    const ctx = await setup();
    const response = await ctx.upload(
      await workbook([
        ["Earthwork", "1.1", "Excavation", "cum", null, 450, 285.5, null, null],
        ["", "1.2", "", "furlong", "12", 0, "abc", "Tower Z", "NOPE"],
        ["Earthwork", "1.1", "Again", "cum", null, 1, 1, null, null],
        ["Earthwork", "1.3", "Too fine", "cum", null, "1.00001", 1, null, null],
      ]),
    );
    expect(response.status).toBe(StatusCodes.BAD_REQUEST);
    const body = await json<ErrorBody>(response);
    expect(body.code).toBe("IMPORT_HAS_ERRORS");
    const errors = body.details?.errors ?? [];
    expect(
      errors.filter((error) => error.row === 3).map((e) => e.column),
    ).toEqual([
      "Section",
      "Description",
      "UoM",
      "Rate (₹)",
      "Wing / Location",
      "Library code",
    ]);
    expect(errors).toContainEqual({
      row: 4,
      column: "Item no",
      message: "This item number is also on row 2.",
    });
    expect(errors).toContainEqual(
      expect.objectContaining({ row: 5, column: "Quantity" }),
    );
    expect((await ctx.boq()).sections).toEqual([]);
  });

  it("refuses a new quantity or rate for a measured item, as a row error", async () => {
    const ctx = await setup();
    await ctx.upload(
      await workbook([
        ["Earthwork", "1.1", "Excavation", "cum", null, 450, 285.5, null, null],
        ["Earthwork", "1.2", "Filling", "cum", null, 180, 165, null, null],
      ]),
    );
    const item = (await ctx.boq()).sections[0]?.items[0];
    await measureBoqItem(ctx.ws, ctx.by, {
      projectId: ctx.projectId,
      boqItemId: item?.id ?? "",
      quantity: "100",
    });
    const refused = await ctx.upload(
      await workbook([
        ["Earthwork", "1.1", "Excavation", "cum", null, 500, 300, null, null],
        ["Earthwork", "1.2", "Filling", "cum", null, 200, 165, null, null],
      ]),
    );
    const body = await json<ErrorBody>(refused);
    expect(body.details?.errors?.map((e) => [e.row, e.column])).toEqual([
      [2, "Quantity"],
      [2, "Rate (₹)"],
    ]);
    expect((await ctx.boq()).sections[0]?.items[1]?.quantity).toBe("180.0000");
    // The description of a measured item may change.
    const described = await ctx.upload(
      await workbook([
        [
          "Earthwork",
          "1.1",
          "Excavation in hard soil",
          "cum",
          null,
          450,
          285.5,
          null,
          null,
        ],
      ]),
    );
    expect(await json(described)).toMatchObject({ updated: 1 });
  });

  it("links a Library code and fills blank cells from the library", async () => {
    const ctx = await setup();
    const libraryId = await addLibraryItem(ctx.ws, ctx.by, {
      code: "5.1.1",
      uomId: ctx.cum,
      adoptedRate: 6_123_45n,
      shortDescription: "PCC 1:4:8",
      description: "PCC 1:4:8 in foundations",
      sacHsn: "995411",
    });
    const result = await ctx.upload(
      await workbook([
        ["Concrete", "2.1", null, null, null, 10, null, null, "5.1.1"],
      ]),
    );
    expect(await json(result)).toMatchObject({ created: 1 });
    const item = (await ctx.boq()).sections[0]?.items[0];
    expect(item).toMatchObject({
      libraryItemId: libraryId,
      libraryCode: "5.1.1",
      description: "PCC 1:4:8 in foundations",
      uomName: "cum",
      sacHsn: "995411",
      rate: 6_123_45,
    });
  });

  it("refuses an empty sheet, wrong headers and too many rows", async () => {
    const ctx = await setup();
    const empty = await ctx.upload(await workbook([]));
    expect(await json(empty)).toMatchObject({ code: "IMPORT_EMPTY" });
    const wrong = await ctx.upload(await workbook([["x"]], ["Foo", "Bar"]));
    expect(await json(wrong)).toMatchObject({ code: "IMPORT_FILE_INVALID" });
    const many = await ctx.upload(
      await workbook(
        Array.from({ length: 5001 }, (_, index) => [
          "S",
          String(index),
          "x",
          "cum",
          null,
          1,
          1,
          null,
          null,
        ]),
      ),
    );
    expect(await json(many)).toMatchObject({ code: "IMPORT_TOO_MANY" });
    // Another Company's Project.
    const stranger = await newCompany();
    const theirs = await addProject(stranger.workspaceId, stranger.ownerId);
    expect(
      await json(await ctx.upload(await workbook([]), theirs)),
    ).toMatchObject({ code: "PROJECT_NOT_FOUND" });
  });
});

describe("BOQ export (CM-1103)", () => {
  it("writes the whole BOQ with original and current figures, and imports back", async () => {
    const ctx = await setup();
    await ctx.upload(
      await workbook([
        [
          "Earthwork",
          "1.1",
          "Excavation",
          "cum",
          "995411",
          450,
          285.5,
          null,
          null,
        ],
        ["Concrete", "2.1", "PCC", "cum", null, "32.5", 6123.45, null, null],
      ]),
    );
    const item = (await ctx.boq()).sections[0]?.items[0];
    await prisma.constructionContractsBoqItem.update({
      where: { id: item?.id ?? "" },
      data: { quantity: "500" },
    });
    const response = await exportRoute(
      new Request(`${BASE}/export?projectId=${ctx.projectId}`),
    );
    expect(response.status).toBe(StatusCodes.OK);
    expect(response.headers.get("content-disposition")).toContain(".xlsx");
    const rows = await readBack(response);
    expect(rows[0]).toEqual([
      "Section",
      "Item no",
      "Description",
      "UoM",
      "SAC/HSN",
      "Original quantity",
      "Quantity",
      "Original rate (₹)",
      "Rate (₹)",
      "Amount (₹)",
      "Wing / Location",
      "Library code",
    ]);
    expect(rows[1]).toEqual([
      "Earthwork",
      "1.1",
      "Excavation",
      "cum",
      "995411",
      450,
      500,
      285.5,
      285.5,
      142_750,
      null,
      null,
    ]);
    expect(rows[2]?.slice(0, 2)).toEqual(["Concrete", "2.1"]);
    // The export imports back as it is.
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(
      await (
        await exportRoute(
          new Request(`${BASE}/export?projectId=${ctx.projectId}`),
        )
      ).arrayBuffer(),
    );
    const bytes = new Uint8Array(await book.xlsx.writeBuffer());
    expect(await json(await ctx.upload(bytes))).toMatchObject({
      created: 0,
      unchanged: 2,
    });
  });
});
