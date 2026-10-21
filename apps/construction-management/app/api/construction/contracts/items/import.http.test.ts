import { prisma } from "@repo/construction-db";
import ExcelJS from "exceljs";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it, vi } from "vitest";

import { actAs, addMember, newCompany } from "@/test/companies";
import { unitNamed } from "@/test/procurement";

import { GET as exportRoute } from "./export/route";
import { POST as importRoute } from "./import/route";
import type { ConstructionContractsItemResponseModel } from "./item-models";
import { POST as createRoute } from "./route";
import { GET as sampleRoute } from "./sample/route";

vi.mock(import("@repo/auth/construction/server"), async (importOriginal) => ({
  ...(await importOriginal()),
  getCompanyAuthFromHeaders: vi.fn(),
}));

const BASE = "http://localhost/api/construction/contracts/items";
const XLSX =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const HEADERS = [
  "Code",
  "Short description",
  "Description",
  "UoM",
  "SAC/HSN",
  "Schedule",
  "Rate (₹)",
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
  const sheet = book.addWorksheet("Items");
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
    rows.push(HEADERS.map((_, index) => row.getCell(index + 1).value ?? null));
  });
  return rows;
}

const upload = (bytes: Uint8Array) =>
  importRoute(
    new Request(`${BASE}/import`, {
      method: "POST",
      headers: { "content-type": XLSX },
      body: Buffer.from(bytes),
    }),
  );

async function setup() {
  const company = await newCompany();
  const ws = company.workspaceId;
  const by = company.ownerId;
  const owner = { userId: by, workspaceId: ws, role: "owner" as const };
  const cum = await unitNamed(ws, by, "cum");
  actAs(owner);
  return { ws, by, owner, cum };
}

const itemsOf = (ws: string) =>
  prisma.constructionContractsItem.findMany({
    where: { workspaceId: ws, deletedAt: null },
    orderBy: { code: "asc" },
  });

describe("Item import and export (CM-1102, ADR CM-0023 §3)", () => {
  it("serves the sample with its columns and two example rows", async () => {
    await setup();
    const response = await sampleRoute(new Request(`${BASE}/sample`));
    expect(response.status).toBe(StatusCodes.OK);
    expect(response.headers.get("content-type")).toBe(XLSX);
    const rows = await readBack(response);
    expect(rows[0]).toEqual([...HEADERS]);
    expect(rows).toHaveLength(3);
    expect(rows[1]?.[0]).toBe("5.1.1");
  });

  it("imports the sample as it is: a new code adds an Item", async () => {
    const ctx = await setup();
    await unitNamed(ctx.ws, ctx.by, "sqm");
    const sample = await sampleRoute(new Request(`${BASE}/sample`));
    const response = await upload(new Uint8Array(await sample.arrayBuffer()));
    expect(response.status).toBe(StatusCodes.OK);
    expect(await json(response)).toEqual({
      created: 2,
      updated: 0,
      unchanged: 0,
    });
    const items = await itemsOf(ctx.ws);
    expect(items.map((item) => [item.code, item.adoptedRate])).toEqual([
      ["5.1.1", 612345n],
      ["OWN-PL-01", 28500n],
    ]);
    expect(
      await prisma.constructionOrganizationAuditEvent.count({
        where: { workspaceId: ctx.ws, action: "item.created" },
      }),
    ).toBe(2);
  });

  it("updates an existing code ignoring case and never touches its analysis", async () => {
    const ctx = await setup();
    const created = await createRoute(
      new Request(BASE, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          code: "5.1.1",
          shortDescription: "PCC",
          uomId: ctx.cum,
          adoptedRate: 500000,
          overheadPercent: "10",
          lines: [
            { kind: "lump_sum", description: "Sub-contract", rate: 500000 },
          ],
        }),
      }),
    );
    const item = await json<ConstructionContractsItemResponseModel>(created);
    const response = await upload(
      await workbook([
        [
          "5.1.1",
          "PCC 1:4:8",
          "Long words",
          "CUM",
          "995411",
          "CPWD DSR 2023",
          "6,123.45",
        ],
        ["5.1.2", "PCC 1:3:6", null, "cum", null, "CPWD DSR 2023", 6890.1],
      ]),
    );
    expect(response.status).toBe(StatusCodes.OK);
    expect(await json(response)).toEqual({
      created: 1,
      updated: 1,
      unchanged: 0,
    });
    const [first, second] = await itemsOf(ctx.ws);
    expect(first).toMatchObject({
      id: item.id,
      code: "5.1.1",
      shortDescription: "PCC 1:4:8",
      description: "Long words",
      sacHsn: "995411",
      schedule: "CPWD DSR 2023",
      adoptedRate: 612345n,
      analysedRate: 550000n,
    });
    expect(second).toMatchObject({ code: "5.1.2", adoptedRate: 689010n });
    expect(
      await prisma.constructionContractsItemAnalysisLine.count({
        where: { itemId: item.id },
      }),
    ).toBe(1);

    // The same sheet again changes nothing; a blank cell clears it.
    const again = await upload(
      await workbook([
        [
          "5.1.1",
          "PCC 1:4:8",
          "Long words",
          "cum",
          "995411",
          "CPWD DSR 2023",
          6123.45,
        ],
        ["5.1.2", "PCC 1:3:6", null, "cum", null, null, 6890.1],
      ]),
    );
    expect(await json(again)).toEqual({ created: 0, updated: 1, unchanged: 1 });
    expect((await itemsOf(ctx.ws))[1]?.schedule).toBeNull();
  });

  it("saves nothing when any row is wrong, and lists every problem by row and column", async () => {
    const ctx = await setup();
    const response = await upload(
      await workbook([
        ["N-1", "Good row", null, "cum", null, null, 100],
        [null, null, null, "furlong", "99", null, "abc"],
        ["N-1", "Twice", null, "cum", null, null, 100],
        ["N-3", "Too precise", null, "cum", null, "S".repeat(81), "1.234"],
        ["N-4", "No rate", null, null, null, null, null],
      ]),
    );
    expect(response.status).toBe(StatusCodes.BAD_REQUEST);
    const body = await json<ErrorBody>(response);
    expect(body.code).toBe("IMPORT_HAS_ERRORS");
    expect(
      body.details?.errors?.map((error) => [error.row, error.column]),
    ).toEqual([
      [3, "Code"],
      [3, "UoM"],
      [3, "Rate (₹)"],
      [4, "Code"],
      [5, "Schedule"],
      [5, "Rate (₹)"],
      [6, "UoM"],
      [6, "Rate (₹)"],
    ]);
    expect(body.details?.errors?.[3]?.message).toBe(
      "This code is also on row 2.",
    );
    expect(await itemsOf(ctx.ws)).toEqual([]);

    const empty = await upload(await workbook([]));
    expect((await json<ErrorBody>(empty)).code).toBe("IMPORT_EMPTY");
    const noHeaders = await upload(
      await workbook(
        [["N-1", "x", null, "cum", null, null, 1]],
        ["Foo", "Bar"],
      ),
    );
    expect((await json<ErrorBody>(noHeaders)).code).toBe("IMPORT_FILE_INVALID");
    const notExcel = await upload(new TextEncoder().encode("code,rate"));
    expect((await json<ErrorBody>(notExcel)).code).toBe("IMPORT_FILE_INVALID");
  });

  it("caps an import at 2,000 rows", async () => {
    await setup();
    const rows = Array.from({ length: 2001 }, (_, index) => [
      `C-${String(index)}`,
      "Row",
      null,
      "cum",
      null,
      null,
      1,
    ]);
    const response = await upload(await workbook(rows));
    expect(response.status).toBe(StatusCodes.BAD_REQUEST);
    expect((await json<ErrorBody>(response)).code).toBe("IMPORT_TOO_MANY");
  });

  it("exports the current filter in the sample's columns", async () => {
    await setup();
    await upload(
      await workbook([
        ["5.1.2", "PCC 1:3:6", null, "cum", "995411", "CPWD DSR 2023", 6890.1],
        [
          "5.1.1",
          "PCC 1:4:8",
          "Long words",
          "cum",
          null,
          "CPWD DSR 2023",
          6123.45,
        ],
        ["OWN-1", "Shuttering", null, "cum", null, "Own", 450],
      ]),
    );
    const response = await exportRoute(
      new Request(
        `${BASE}/export?schedule=${encodeURIComponent("CPWD DSR 2023")}`,
      ),
    );
    expect(response.status).toBe(StatusCodes.OK);
    expect(response.headers.get("content-disposition")).toContain(
      "item-library.xlsx",
    );
    const rows = await readBack(response);
    expect(rows).toEqual([
      [...HEADERS],
      [
        "5.1.1",
        "PCC 1:4:8",
        "Long words",
        "cum",
        null,
        "CPWD DSR 2023",
        6123.45,
      ],
      ["5.1.2", "PCC 1:3:6", null, "cum", "995411", "CPWD DSR 2023", 6890.1],
    ]);
    const searched = await readBack(
      await exportRoute(new Request(`${BASE}/export?q=shutter`)),
    );
    expect(searched.slice(1).map((row) => row[0])).toEqual(["OWN-1"]);
  });

  it("needs the Import flag for the sample and the import, and Export to export", async () => {
    const ctx = await setup();
    const sheet = await workbook([["N-1", "Row", null, "cum", null, null, 1]]);
    const reader = await addMember(ctx.ws, ctx.by, {
      "contracts.items": ["create", "read", "update"],
    });
    actAs({ userId: reader.userId, workspaceId: ctx.ws, role: "member" });
    expect((await upload(sheet)).status).toBe(StatusCodes.FORBIDDEN);
    expect((await sampleRoute(new Request(`${BASE}/sample`))).status).toBe(
      StatusCodes.FORBIDDEN,
    );
    expect((await exportRoute(new Request(`${BASE}/export`))).status).toBe(
      StatusCodes.FORBIDDEN,
    );

    const importer = await addMember(ctx.ws, ctx.by, {
      "contracts.items": ["read", "import"],
    });
    actAs({ userId: importer.userId, workspaceId: ctx.ws, role: "member" });
    expect((await upload(sheet)).status).toBe(StatusCodes.OK);
    expect((await exportRoute(new Request(`${BASE}/export`))).status).toBe(
      StatusCodes.FORBIDDEN,
    );

    const exporter = await addMember(ctx.ws, ctx.by, {
      "contracts.items": ["read", "export"],
    });
    actAs({ userId: exporter.userId, workspaceId: ctx.ws, role: "member" });
    expect((await exportRoute(new Request(`${BASE}/export`))).status).toBe(
      StatusCodes.OK,
    );
    expect((await upload(sheet)).status).toBe(StatusCodes.FORBIDDEN);
  });
});
