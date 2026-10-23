import ExcelJS from "exceljs";
import { StatusCodes } from "http-status-codes";
import { afterEach, describe, expect, it, vi } from "vitest";

import { actAs, addMember, newCompany } from "@/test/companies";

import { POST as deleteRoute } from "./[id]/delete/route";
import { POST as updateRoute } from "./[id]/update/route";
import { GET as exportRoute } from "./export/route";
import { POST as importRoute } from "./import/route";
import type {
  ConstructionContractsPriceIndexModel,
  ListConstructionContractsPriceIndicesResponseModel,
} from "./price-index-models";
import { GET as listRoute, POST as createRoute } from "./route";
import { GET as sampleRoute } from "./sample/route";

vi.mock(import("@repo/auth/construction/server"), async (importOriginal) => ({
  ...(await importOriginal()),
  getCompanyAuthFromHeaders: vi.fn(),
}));

afterEach(() => {
  vi.restoreAllMocks();
});

const BASE = "http://localhost/api/construction/contracts/price-indices";
const XLSX =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const post = (url: string, body: unknown) =>
  new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
const params = (id: string) => ({ params: Promise.resolve({ id }) });

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

const api = {
  list: () => listRoute(new Request(BASE)),
  create: (body: unknown) => createRoute(post(BASE, body)),
  update: (id: string, body: unknown) =>
    updateRoute(post(`${BASE}/${id}/update`, body), params(id)),
  remove: (id: string) =>
    deleteRoute(post(`${BASE}/${id}/delete`, {}), params(id)),
  upload: async (rows: unknown[][], headers = ["Series", "Month", "Value"]) => {
    const book = new ExcelJS.Workbook();
    const sheet = book.addWorksheet("Price indices");
    sheet.addRow(headers);
    for (const row of rows) sheet.addRow(row);
    const bytes = new Uint8Array(await book.xlsx.writeBuffer());
    return importRoute(
      new Request(`${BASE}/import`, {
        method: "POST",
        headers: { "content-type": XLSX },
        body: Buffer.from(bytes),
      }),
    );
  },
};

async function setup() {
  const company = await newCompany();
  const owner = {
    userId: company.ownerId,
    workspaceId: company.workspaceId,
    role: "owner" as const,
  };
  actAs(owner);
  return { ...company, owner };
}

type Index = ConstructionContractsPriceIndexModel;
type List = ListConstructionContractsPriceIndicesResponseModel;

describe("price indices (CM-1109)", () => {
  it("adds, lists by series and month, edits and removes a month", async () => {
    await setup();
    const created = await api.create({
      series: "CPI-IW",
      month: "2026-02",
      value: "141.5",
    });
    expect(created.status).toBe(StatusCodes.CREATED);
    const first = await json<Index>(created);
    expect(first).toMatchObject({
      series: "CPI-IW",
      month: "2026-02-01",
      value: "141.5000",
    });
    // The series is matched ignoring case and keeps its first spelling.
    const second = await json<Index>(
      await api.create({ series: "cpi-iw", month: "2026-01", value: 140 }),
    );
    expect(second.series).toBe("CPI-IW");
    const taken = await api.create({
      series: "CPI-IW",
      month: "2026-01-01",
      value: 1,
    });
    expect(taken.status).toBe(StatusCodes.CONFLICT);
    expect((await json<{ code: string }>(taken)).code).toBe(
      "PRICE_INDEX_EXISTS",
    );
    for (const [body, code] of [
      [
        { series: " ", month: "2026-03", value: 1 },
        "PRICE_INDEX_SERIES_REQUIRED",
      ],
      [
        { series: "X", month: "2026-03-15", value: 1 },
        "PRICE_INDEX_MONTH_INVALID",
      ],
      [
        { series: "X", month: "2026-03", value: "0" },
        "PRICE_INDEX_VALUE_INVALID",
      ],
      [
        { series: "X", month: "2026-03", value: "1.23456" },
        "PRICE_INDEX_VALUE_INVALID",
      ],
    ] as const) {
      const response = await api.create(body);
      expect(response.status).toBe(StatusCodes.BAD_REQUEST);
      expect((await json<{ code: string }>(response)).code).toBe(code);
    }

    const list = await json<List>(await api.list());
    expect(list.series).toHaveLength(1);
    expect(list.series[0]?.indices.map((row) => row.month)).toEqual([
      "2026-01-01",
      "2026-02-01",
    ]);
    expect(list.suggestions).not.toContain("CPI-IW");
    expect(list.suggestions).toContain("WPI – Cement");
    expect(list.viewerFlags).toContain("import");

    const updated = await json<Index>(
      await api.update(first.id, {
        value: "142",
        expectedUpdatedAt: first.updatedAt,
      }),
    );
    expect(updated.value).toBe("142.0000");
    const stale = await api.update(first.id, {
      value: "143",
      expectedUpdatedAt: first.updatedAt,
    });
    expect(stale.status).toBe(StatusCodes.CONFLICT);
    expect((await api.remove(first.id)).status).toBe(StatusCodes.NO_CONTENT);
    expect((await api.remove(first.id)).status).toBe(StatusCodes.NOT_FOUND);
  });

  it("imports series, month and value all or nothing, updating months kept", async () => {
    await setup();
    await api.create({ series: "WPI – Cement", month: "2026-01", value: 100 });
    const bad = await api.upload([
      ["WPI – Cement", "2026-02", 104],
      ["", "2026-02", 104],
      ["CPI-IW", "April 2026", "abc"],
      ["CPI-IW", new Date(Date.UTC(2026, 3, 20)), 150],
    ]);
    expect(bad.status).toBe(StatusCodes.BAD_REQUEST);
    const refused = await json<{
      code: string;
      details: { errors: { row: number; column: string }[] };
    }>(bad);
    expect(refused.code).toBe("IMPORT_HAS_ERRORS");
    expect(
      refused.details.errors.map((error) => [error.row, error.column]),
    ).toEqual([
      [3, "Series"],
      [4, "Value"],
    ]);
    expect(
      (await json<List>(await api.list())).series[0]?.indices,
    ).toHaveLength(1);

    const good = await api.upload([
      ["wpi – cement", "2026-01", 100],
      ["WPI – Cement", "2026-02", 104.25],
      ["CPI-IW", "Apr 2026", 150],
      ["CPI-IW", new Date(Date.UTC(2026, 4, 1)), 151],
    ]);
    expect(good.status).toBe(StatusCodes.OK);
    expect(await good.json()).toEqual({ created: 3, updated: 0, unchanged: 1 });
    const again = await api.upload([["WPI – Cement", "2026-02", 105]]);
    expect(await again.json()).toEqual({
      created: 0,
      updated: 1,
      unchanged: 0,
    });
    const list = await json<List>(await api.list());
    expect(
      list.series.map((series) => [
        series.name,
        series.indices.map((row) => `${row.month}=${row.value}`),
      ]),
    ).toEqual([
      ["CPI-IW", ["2026-04-01=150.0000", "2026-05-01=151.0000"]],
      ["WPI – Cement", ["2026-01-01=100.0000", "2026-02-01=105.0000"]],
    ]);

    const exported = await exportRoute(new Request(`${BASE}/export`));
    expect(exported.headers.get("content-type")).toBe(XLSX);
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(await exported.arrayBuffer());
    const rows: unknown[][] = [];
    book.worksheets[0]?.eachRow((row) => {
      rows.push([1, 2, 3].map((cell) => row.getCell(cell).value));
    });
    expect(rows[0]).toEqual(["Series", "Month", "Value"]);
    expect(rows[4]).toEqual(["WPI – Cement", "2026-02", 105]);
    expect((await sampleRoute(new Request(`${BASE}/sample`))).status).toBe(
      StatusCodes.OK,
    );
  });

  it("uses the Item Library's flags and keeps each Company's own", async () => {
    const ctx = await setup();
    const kept = await json<Index>(
      await api.create({ series: "CPI-IW", month: "2026-01", value: 140 }),
    );
    const reader = await addMember(ctx.workspaceId, ctx.ownerId, {
      "contracts.items": ["read"],
    });
    actAs({
      userId: reader.userId,
      workspaceId: ctx.workspaceId,
      role: "member",
    });
    expect((await api.list()).status).toBe(StatusCodes.OK);
    expect(
      (await api.create({ series: "X", month: "2026-01", value: 1 })).status,
    ).toBe(StatusCodes.FORBIDDEN);
    expect((await api.upload([["X", "2026-01", 1]])).status).toBe(
      StatusCodes.FORBIDDEN,
    );
    expect((await exportRoute(new Request(`${BASE}/export`))).status).toBe(
      StatusCodes.FORBIDDEN,
    );
    const other = await newCompany("Other Builders");
    actAs({ userId: other.ownerId, workspaceId: other.workspaceId });
    expect((await json<List>(await api.list())).series).toEqual([]);
    expect((await api.update(kept.id, { value: 1 })).status).toBe(
      StatusCodes.NOT_FOUND,
    );
  });
});
