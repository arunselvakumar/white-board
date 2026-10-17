import { prisma } from "@repo/construction-db";
import ExcelJS from "exceljs";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it, vi } from "vitest";

import { GET as getOpenApi } from "@/app/api/openapi.json/route";
import type { Flag } from "@/src/shared-kernel/access";
import { addDays, todayIn } from "@/src/shared-kernel/calendar-date";
import { actAs, addMember, newCompany } from "@/test/companies";
import { salesBookingRow, salesProject, salesWing } from "@/test/sales";
import { sharedAssign } from "@/test/site-work";

import { POST as available } from "./[unitId]/available/route";
import { POST as details } from "./[unitId]/details/route";
import { GET as getUnit } from "./[unitId]/route";
import { POST as unavailable } from "./[unitId]/unavailable/route";
import { POST as importUnits } from "./import/route";
import { GET as sample } from "./import-sample/route";
import { GET as chart } from "./route";

vi.mock(import("@repo/auth/construction/server"), async (importOriginal) => ({
  ...(await importOriginal()),
  getCompanyAuthFromHeaders: vi.fn(),
}));

const BASE = "http://localhost/api/construction/sales/units";
const TODAY = todayIn("Asia/Kolkata");
const XLSX =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

type Counts = {
  total: number;
  available: number;
  on_hold: number;
  booked: number;
  unavailable: number;
};
type Chart = {
  counts: Counts;
  wings: { id: string; name: string; counts: Counts }[];
  wing: {
    id: string;
    floors: {
      name: string;
      units: {
        id: string;
        name: string;
        status: string;
        unitType: string | null;
        booking: { status: string } | null;
      }[];
    }[];
  } | null;
  actions: { update: boolean; create: boolean };
};
type Unit = {
  id: string;
  status: string;
  profile: {
    unitType: string | null;
    carpetArea: string | null;
    builtUpArea: string | null;
    areaUnit: string;
    unavailable: boolean;
    unavailableReason: string | null;
    unavailableNote: string | null;
    updatedAt: string | null;
  };
  booking: { id: string; status: string } | null;
  bookings: { id: string; status: string; cancelReason: string | null }[];
  actions: Record<string, boolean>;
};
type ErrorBody = {
  code: string;
  details?: {
    field?: string;
    errors?: { row: number; field: string; message: string }[];
  };
};

const params = (unitId: string) => ({ params: Promise.resolve({ unitId }) });

function post(path: string, body: unknown): Request {
  return new Request(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function setup() {
  const company = await newCompany();
  const ws = company.workspaceId;
  const by = company.ownerId;
  const owner = { userId: by, workspaceId: ws, role: "owner" as const };
  const projectId = await salesProject(ws, by, "Green Acres");
  const wing = await salesWing(ws, projectId, by, {
    name: "Tower A",
    floors: 2,
    perFloor: 2,
  });
  actAs(owner);
  return { ws, by, owner, projectId, wing };
}

type Ctx = Awaited<ReturnType<typeof setup>>;

async function memberWith(ctx: Ctx, flags: Flag[], onProject = true) {
  const added = await addMember(ctx.ws, ctx.by, { "sales.bookings": flags });
  if (onProject) await sharedAssign(added.memberId, ctx.projectId);
  return { userId: added.userId, workspaceId: ctx.ws, role: "member" as const };
}

/** "Tower B" in a second phase (`salesWing` names every phase "Phase 1"). */
async function secondWing(ctx: Ctx) {
  await prisma.constructionProjectsPhase.updateMany({
    where: { projectId: ctx.projectId },
    data: { name: "Phase A" },
  });
  const wing = await salesWing(ctx.ws, ctx.projectId, ctx.by, {
    name: "Tower B",
    floors: 0,
    perFloor: 3,
  });
  await prisma.constructionProjectsPhase.updateMany({
    where: { projectId: ctx.projectId, name: "Phase 1" },
    data: { position: 1 },
  });
  return wing;
}

const readChart = async (ctx: Ctx, query = "") =>
  chart(new Request(`${BASE}?projectId=${ctx.projectId}${query}`));

const readUnit = async (ctx: Ctx, unitId: string) =>
  getUnit(
    new Request(`${BASE}/${unitId}?projectId=${ctx.projectId}`),
    params(unitId),
  );

async function unit(ctx: Ctx, unitId: string): Promise<Unit> {
  const response = await readUnit(ctx, unitId);
  expect(response.status).toBe(StatusCodes.OK);
  return json<Unit>(response);
}

const setDetails = (
  ctx: Ctx,
  unitId: string,
  body: Record<string, unknown>,
  expectedUpdatedAt: string | null = null,
) =>
  details(
    post(`/${unitId}/details`, {
      projectId: ctx.projectId,
      expectedUpdatedAt,
      ...body,
    }),
    params(unitId),
  );

const markUnavailable = (
  ctx: Ctx,
  unitId: string,
  expectedUpdatedAt: string | null,
  body: Record<string, unknown> = { reason: "landowner_share" },
) =>
  unavailable(
    post(`/${unitId}/unavailable`, {
      projectId: ctx.projectId,
      expectedUpdatedAt,
      ...body,
    }),
    params(unitId),
  );

async function workbook(rows: unknown[][]): Promise<Uint8Array> {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet("Units");
  sheet.addRow([
    "Wing*",
    "Unit No*",
    "Unit type",
    "Carpet area",
    "Built-up area",
    "Super built-up area",
    "Area unit",
    "Unavailable",
    "Unavailable reason",
  ]);
  for (const row of rows) sheet.addRow(row);
  return new Uint8Array(await book.xlsx.writeBuffer());
}

const upload = (ctx: Ctx, bytes: Uint8Array) =>
  importUnits(
    new Request(`${BASE}/import?projectId=${ctx.projectId}`, {
      method: "POST",
      headers: { "content-type": XLSX },
      body: Buffer.from(bytes),
    }),
  );

describe("Units chart and unit sales details (CM-1005, CM-0022 §8)", () => {
  it("counts every unit by sales status and draws a Wing top floor first", async () => {
    const ctx = await setup();
    const other = await secondWing(ctx);
    const units = ctx.wing.units;
    await salesBookingRow(
      ctx.ws,
      ctx.projectId,
      ctx.wing.wingId,
      units["101"] ?? "",
      ctx.by,
      { status: "booked" },
    );
    await salesBookingRow(
      ctx.ws,
      ctx.projectId,
      ctx.wing.wingId,
      units["102"] ?? "",
      ctx.by,
      { status: "on_hold", holdUntil: addDays(TODAY, 3) },
    );
    // A hold past its Hold until date counts Available.
    await salesBookingRow(
      ctx.ws,
      ctx.projectId,
      ctx.wing.wingId,
      units["201"] ?? "",
      ctx.by,
      {
        status: "on_hold",
        bookingDate: addDays(TODAY, -5),
        holdUntil: addDays(TODAY, -1),
      },
    );
    const g01 = units["G01"] ?? "";
    const before = await unit(ctx, g01);
    expect(
      (await markUnavailable(ctx, g01, before.profile.updatedAt)).status,
    ).toBe(StatusCodes.OK);

    const body = await json<Chart>(await readChart(ctx));
    expect(body.counts).toEqual({
      total: 9,
      available: 6,
      on_hold: 1,
      booked: 1,
      unavailable: 1,
    });
    expect(body.wings.map((wing) => [wing.name, wing.counts.total])).toEqual([
      ["Tower A", 6],
      ["Tower B", 3],
    ]);
    expect(body.wing?.id).toBe(ctx.wing.wingId);
    expect(body.wing?.floors.map((floor) => floor.name)).toEqual([
      "Floor 2",
      "Floor 1",
      "Ground",
    ]);
    const statuses = Object.fromEntries(
      body.wing?.floors.flatMap((floor) =>
        floor.units.map((item) => [item.name, item.status]),
      ) ?? [],
    );
    expect(statuses).toMatchObject({
      "101": "booked",
      "102": "on_hold",
      "201": "available",
      G01: "unavailable",
    });
    const expired = body.wing?.floors[0]?.units[0];
    expect(expired?.booking?.status).toBe("hold_expired");
    expect(body.actions).toEqual({ update: true, create: true });

    const second = await json<Chart>(
      await readChart(ctx, `&wingId=${other.wingId}`),
    );
    expect(second.wing?.floors).toHaveLength(1);
    expect(second.wing?.floors[0]?.units.map((item) => item.name)).toEqual([
      "G01",
      "G02",
      "G03",
    ]);
  });

  it("sets Unit type and areas, refusing a stale save and bad areas", async () => {
    const ctx = await setup();
    const id = ctx.wing.units["101"] ?? "";
    const first = await setDetails(ctx, id, {
      unitType: " 2BHK ",
      carpetArea: "1,050.50",
      builtUpArea: 1240,
      areaUnit: "sq_ft",
    });
    expect(first.status).toBe(StatusCodes.OK);
    const saved = await json<Unit>(first);
    expect(saved.profile).toMatchObject({
      unitType: "2BHK",
      carpetArea: "1050.5",
      builtUpArea: "1240",
      areaUnit: "sq_ft",
      unavailable: false,
    });
    expect(saved.actions).toMatchObject({
      editDetails: true,
      markUnavailable: true,
      markAvailable: false,
      book: true,
    });
    const stale = await setDetails(ctx, id, { unitType: "3BHK" }, null);
    expect(stale.status).toBe(StatusCodes.CONFLICT);
    expect((await json<ErrorBody>(stale)).code).toBe("UNIT_PROFILE_CHANGED");
    const bad = await setDetails(
      ctx,
      id,
      { carpetArea: "0" },
      saved.profile.updatedAt,
    );
    expect(bad.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await json<ErrorBody>(bad)).toMatchObject({
      code: "AREA_INVALID",
      details: { field: "carpetArea" },
    });
    const chartBody = await json<Chart>(await readChart(ctx));
    const cell = chartBody.wing?.floors
      .flatMap((floor) => floor.units)
      .find((item) => item.id === id);
    expect(cell?.unitType).toBe("2BHK");
    const audit = await prisma.constructionOrganizationAuditEvent.count({
      where: {
        workspaceId: ctx.ws,
        entityId: id,
        action: "unit_profile.updated",
      },
    });
    expect(audit).toBe(1);
  });

  it("marks a unit unavailable and available again; a booked unit cannot", async () => {
    const ctx = await setup();
    const id = ctx.wing.units["102"] ?? "";
    const marked = await markUnavailable(ctx, id, null, {
      reason: "reserved",
      note: "Kept for the landowner's family",
    });
    expect(marked.status).toBe(StatusCodes.OK);
    const body = await json<Unit>(marked);
    expect(body.status).toBe("unavailable");
    expect(body.profile).toMatchObject({
      unavailable: true,
      unavailableReason: "reserved",
      unavailableNote: "Kept for the landowner's family",
    });
    expect(body.actions).toMatchObject({ markAvailable: true, book: false });
    const again = await available(
      post(`/${id}/available`, {
        projectId: ctx.projectId,
        expectedUpdatedAt: body.profile.updatedAt,
      }),
      params(id),
    );
    expect(again.status).toBe(StatusCodes.OK);
    const freed = await json<Unit>(again);
    expect(freed.status).toBe("available");
    expect(freed.profile.unavailableReason).toBeNull();

    const booked = ctx.wing.units["101"] ?? "";
    const bookingId = await salesBookingRow(
      ctx.ws,
      ctx.projectId,
      ctx.wing.wingId,
      booked,
      ctx.by,
      { status: "on_hold" },
    );
    const refused = await markUnavailable(ctx, booked, null);
    expect(refused.status).toBe(StatusCodes.CONFLICT);
    expect(await json<ErrorBody>(refused)).toMatchObject({
      code: "UNIT_HAS_BOOKING",
      details: { bookingId },
    });
    const badReason = await markUnavailable(ctx, id, freed.profile.updatedAt, {
      reason: "sold",
    });
    expect(badReason.status).toBe(StatusCodes.BAD_REQUEST);
  });

  it("cancels an expired hold when its unit is marked unavailable", async () => {
    const ctx = await setup();
    const id = ctx.wing.units["201"] ?? "";
    const bookingId = await salesBookingRow(
      ctx.ws,
      ctx.projectId,
      ctx.wing.wingId,
      id,
      ctx.by,
      {
        status: "on_hold",
        bookingDate: addDays(TODAY, -4),
        holdUntil: addDays(TODAY, -1),
      },
    );
    const before = await unit(ctx, id);
    expect(before.status).toBe("available");
    expect(before.booking?.status).toBe("hold_expired");
    const response = await markUnavailable(ctx, id, null);
    expect(response.status).toBe(StatusCodes.OK);
    const after = await json<Unit>(response);
    expect(after.booking).toBeNull();
    expect(after.bookings[0]).toMatchObject({
      id: bookingId,
      status: "cancelled",
      cancelReason: "Hold expired",
    });
    const events = await prisma.constructionSalesBookingEvent.findMany({
      where: { bookingId },
      orderBy: { occurredAt: "asc" },
    });
    expect(events.at(-1)).toMatchObject({
      status: "cancelled",
      reason: "Hold expired",
      actorUserId: "system",
    });
  });

  it("checks access: Read sees, Update writes, other Projects and Companies are refused", async () => {
    const ctx = await setup();
    const id = ctx.wing.units["101"] ?? "";
    actAs(await memberWith(ctx, ["read"]));
    expect((await readChart(ctx)).status).toBe(StatusCodes.OK);
    const readOnly = await unit(ctx, id);
    expect(readOnly.actions).toEqual({
      editDetails: false,
      markUnavailable: false,
      markAvailable: false,
      book: false,
    });
    const refused = await setDetails(ctx, id, { unitType: "Shop" });
    expect(refused.status).toBe(StatusCodes.FORBIDDEN);
    actAs(await memberWith(ctx, ["read", "update"], false));
    expect((await readChart(ctx)).status).toBe(StatusCodes.FORBIDDEN);

    actAs(ctx.owner);
    const elsewhere = await salesProject(ctx.ws, ctx.by);
    const foreign = await salesWing(ctx.ws, elsewhere, ctx.by, { floors: 0 });
    const wrong = await readUnit(ctx, foreign.units["G01"] ?? "");
    expect(wrong.status).toBe(StatusCodes.NOT_FOUND);
    expect((await json<ErrorBody>(wrong)).code).toBe("UNIT_NOT_FOUND");

    const stranger = await newCompany();
    actAs({ userId: stranger.ownerId, workspaceId: stranger.workspaceId });
    expect((await readChart(ctx)).status).toBe(StatusCodes.NOT_FOUND);
  });
});

describe("Unit import (CM-1005, CM-0022 §8)", () => {
  it("offers a sample filled with the Project's units and today's details", async () => {
    const ctx = await setup();
    const id = ctx.wing.units["101"] ?? "";
    await setDetails(ctx, id, { unitType: "2BHK", carpetArea: "850" });
    const response = await sample(
      new Request(`${BASE}/import-sample?projectId=${ctx.projectId}`),
    );
    expect(response.status).toBe(StatusCodes.OK);
    expect(response.headers.get("content-type")).toBe(XLSX);
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(await response.arrayBuffer());
    const sheet = book.getWorksheet("Units");
    expect(sheet?.rowCount).toBe(7);
    const rows = [2, 3, 4, 5, 6, 7].map((n) => {
      const values = sheet?.getRow(n).values as unknown[];
      return values.slice(1, 5);
    });
    expect(rows).toContainEqual(["Tower A", "101", "2BHK", 850]);
    expect(rows[0]?.slice(0, 2)).toEqual(["Tower A", "201"]);
  });

  it("updates existing units by Wing and Unit No, ignoring case", async () => {
    const ctx = await setup();
    const bytes = await workbook([
      ["tower a", "101", "2BHK", 820.5, 1010, 1200, "sq ft", "No", ""],
      [
        "TOWER A",
        "g01",
        "Shop",
        "300",
        "",
        "",
        "sq m",
        "Yes",
        "Landowner share",
      ],
    ]);
    const response = await upload(ctx, bytes);
    expect(response.status).toBe(StatusCodes.OK);
    expect(await json<{ updated: number }>(response)).toEqual({ updated: 2 });
    const first = await unit(ctx, ctx.wing.units["101"] ?? "");
    expect(first.profile).toMatchObject({
      unitType: "2BHK",
      carpetArea: "820.5",
      builtUpArea: "1010",
      areaUnit: "sq_ft",
      unavailable: false,
    });
    const shop = await unit(ctx, ctx.wing.units["G01"] ?? "");
    expect(shop.status).toBe("unavailable");
    expect(shop.profile).toMatchObject({
      unitType: "Shop",
      areaUnit: "sq_m",
      unavailableReason: "landowner_share",
    });
  });

  it("saves nothing when any row is wrong and names each problem by row", async () => {
    const ctx = await setup();
    await salesBookingRow(
      ctx.ws,
      ctx.projectId,
      ctx.wing.wingId,
      ctx.wing.units["102"] ?? "",
      ctx.by,
    );
    const bytes = await workbook([
      ["Tower A", "101", "2BHK", 820, "", "", "", "No", ""],
      ["Tower Z", "101", "", "", "", "", "", "", ""],
      ["Tower A", "999", "", "", "", "", "", "", ""],
      ["Tower A", "101", "", "", "", "", "", "", ""],
      ["Tower A", "201", "", "-4", "", "", "acres", "Maybe", ""],
      ["Tower A", "202", "", "", "", "", "", "Yes", ""],
    ]);
    const response = await upload(ctx, bytes);
    expect(response.status).toBe(StatusCodes.BAD_REQUEST);
    const body = await json<ErrorBody>(response);
    expect(body.code).toBe("IMPORT_HAS_ERRORS");
    expect(
      body.details?.errors?.map((error) => [error.row, error.field]),
    ).toEqual([
      [3, "Wing*"],
      [4, "Unit No*"],
      [5, "Unit No*"],
      [6, "Area unit"],
      [6, "Carpet area"],
      [6, "Unavailable"],
      [7, "Unavailable reason"],
    ]);
    const first = await unit(ctx, ctx.wing.units["101"] ?? "");
    expect(first.profile.unitType).toBeNull();

    const booked = await upload(
      ctx,
      await workbook([
        ["Tower A", "102", "", "", "", "", "", "Yes", "Reserved"],
      ]),
    );
    expect(booked.status).toBe(StatusCodes.BAD_REQUEST);
    expect((await json<ErrorBody>(booked)).details?.errors?.[0]).toMatchObject({
      row: 2,
      field: "Unavailable",
    });
  });

  it("needs Booking Update and a sheet with the headers", async () => {
    const ctx = await setup();
    const bad = await upload(ctx, new Uint8Array([1, 2, 3, 4]));
    expect((await json<ErrorBody>(bad)).code).toBe("IMPORT_FILE_INVALID");
    actAs(await memberWith(ctx, ["read"]));
    const refused = await upload(ctx, await workbook([["Tower A", "101"]]));
    expect(refused.status).toBe(StatusCodes.FORBIDDEN);
  });

  it("is in the OpenAPI document", async () => {
    const document = await json<{ paths: Record<string, unknown> }>(
      getOpenApi(),
    );
    expect(document.paths).toHaveProperty("/api/construction/sales/units");
    expect(document.paths).toHaveProperty(
      "/api/construction/sales/units/{unitId}/unavailable",
    );
    expect(document.paths).toHaveProperty(
      "/api/construction/sales/units/import",
    );
  });
});
