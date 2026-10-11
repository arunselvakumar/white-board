import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GET as inventory } from "@/app/api/construction/procurement/inventory/route";
import { POST as availability } from "@/app/api/construction/site-work/equipment/[id]/availability/route";
import { GET as getEquipment } from "@/app/api/construction/site-work/equipment/[id]/route";
import { GET as sheetOptions } from "@/app/api/construction/site-work/equipment/sheet-options/route";
import { GET as getOpenApi } from "@/app/api/openapi.json/route";
import type { Flag } from "@/src/shared-kernel/access";
import { addDays, todayIn } from "@/src/shared-kernel/calendar-date";
import {
  InProcessEventDispatcher,
  type DomainEvent,
} from "@/src/shared-kernel/events";
import { newId } from "@/src/shared-kernel/ids";
import { actAs, addMember, addProject, newCompany } from "@/test/companies";
import {
  addContractor,
  addMaterial,
  addOpeningStock,
} from "@/test/procurement";
import {
  EQUIPMENT_API,
  equipmentAdd,
  equipmentLogMaintenance,
  equipmentOwnedInput,
  equipmentRentedInput,
  equipmentTransfer,
  type EquipmentJson,
  worksheetContractor,
  worksheetDepartment,
} from "@/test/site-work";

import {
  GET as getSettings,
  POST as saveSettings,
} from "../settings/equipment-sheets/route";
import { POST as approve } from "./[id]/approve/route";
import { POST as remove } from "./[id]/delete/route";
import { POST as reject } from "./[id]/reject/route";
import { GET as getOne } from "./[id]/route";
import { POST as update } from "./[id]/update/route";
import { GET as availableStock } from "./available-stock/route";
import { POST as bulkApprove } from "./bulk-approve/route";
import { POST as bulkReject } from "./bulk-reject/route";
import { GET as formOptions } from "./form-options/route";
import { GET as list, POST as create } from "./route";

vi.mock(import("@repo/auth/construction/server"), async (importOriginal) => ({
  ...(await importOriginal()),
  getCompanyAuthFromHeaders: vi.fn(),
}));

const ORIGIN = "http://localhost";
const BASE = `${ORIGIN}/api/construction/site-work/equipment-sheets`;
const SETTINGS = `${ORIGIN}/api/construction/site-work/settings/equipment-sheets`;
const TODAY = todayIn("Asia/Kolkata");
const YESTERDAY = addDays(TODAY, -1);
const PLACED = addDays(TODAY, -30);
const MENU = "site_work.equipment_usage";

type Sheet = {
  id: string;
  number: string;
  projectId: string;
  sheetDate: string;
  shift: string;
  equipment: { id: string; name: string; hireRate: number | null };
  ownership: string;
  utilisationBasis: string;
  workingTimeMethod: string;
  operatorName: string | null;
  supervisor: { userId: string; name: string | null } | null;
  contractor: { id: string; name: string | null } | null;
  department: { id: string; name: string | null } | null;
  timeShifts: { startTime: string; endTime: string; minutes: number }[];
  shiftHours: string | null;
  openingReading: string | null;
  closingReading: string | null;
  meterDelta: string | null;
  usageHours: string | null;
  distanceKm: string | null;
  trips: number | null;
  idleHours: string;
  breakdownHours: string;
  fuelQty: string | null;
  fuelBorneBy: string | null;
  fuelOverrun: boolean;
  unitRate: number | null;
  billableQty: string | null;
  hireCost: number | null;
  remark: string | null;
  approvalStatus: string;
  rejectionReason: string | null;
  previousClosing: { reading: string; sheetDate: string } | null;
  meterGap: string | null;
  updatedAt: string;
  materials: { materialId: string; quantity: string }[];
  actions: Record<string, boolean>;
};

const params = (id: string) => ({ params: Promise.resolve({ id }) });

function post(url: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const get = (url: string) => new Request(url);

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function refusal(response: Response) {
  const body = await json<{ code: string; details?: { field?: string } }>(
    response,
  );
  return {
    status: response.status,
    code: body.code,
    field: body.details?.field,
  };
}

async function setup() {
  const company = await newCompany();
  const ws = company.workspaceId;
  const by = company.ownerId;
  const owner = { userId: by, workspaceId: ws, role: "owner" as const };
  const projectId = await addProject(ws, by, "Anugraha Towers");
  const otherProject = await addProject(ws, by, "Villa B");
  const hireParty = await addContractor(ws, by);
  const jcb = await equipmentAdd(
    owner,
    equipmentOwnedInput({
      projectId,
      placedOn: PLACED,
      workingTimeMethod: "time_shifts",
    }),
  );
  const excavator = await equipmentAdd(
    owner,
    equipmentRentedInput(hireParty, { projectId, placedOn: PLACED }),
  );
  actAs(owner);
  return {
    company,
    ws,
    by,
    owner,
    projectId,
    otherProject,
    hireParty,
    jcb,
    excavator,
  };
}

type Ctx = Awaited<ReturnType<typeof setup>>;

async function member(ctx: Ctx, flags: Flag[], onProject = true) {
  const added = await addMember(ctx.ws, ctx.by, { [MENU]: flags });
  if (onProject)
    await prisma.constructionOrganizationTeamMemberProject.create({
      data: { memberId: added.memberId, projectId: ctx.projectId },
    });
  return {
    userId: added.userId,
    workspaceId: ctx.ws,
    role: "member" as const,
  };
}

function body(
  ctx: Ctx,
  equipment: { id: string },
  patch: Record<string, unknown> = {},
) {
  return {
    projectId: ctx.projectId,
    equipmentId: equipment.id,
    sheetDate: YESTERDAY,
    shift: "shift_1",
    operatorName: "Ramesh K",
    timeShifts: [
      { startTime: "08:00", endTime: "12:00" },
      { startTime: "13:00", endTime: "17:30" },
    ],
    idleHours: "1",
    breakdownHours: "0",
    workItem: "Foundation excavation, Block A",
    ...patch,
  };
}

async function save(
  ctx: Ctx,
  equipment: { id: string },
  patch: Record<string, unknown> = {},
) {
  return create(post(BASE, body(ctx, equipment, patch)));
}

async function saved(
  ctx: Ctx,
  equipment: { id: string },
  patch: Record<string, unknown> = {},
) {
  const response = await save(ctx, equipment, patch);
  expect(response.status, await response.clone().text()).toBe(
    StatusCodes.CREATED,
  );
  return json<Sheet>(response);
}

async function edit(
  ctx: Ctx,
  sheet: Sheet,
  equipment: { id: string },
  patch: Record<string, unknown>,
) {
  const {
    projectId: _projectId,
    equipmentId: _equipmentId,
    ...rest
  } = body(ctx, equipment, patch);
  return update(
    post(`${BASE}/${sheet.id}/update`, {
      ...rest,
      expectedUpdatedAt: sheet.updatedAt,
    }),
    params(sheet.id),
  );
}

async function detail(id: string): Promise<Sheet> {
  return json<Sheet>(await getOne(get(`${BASE}/${id}`), params(id)));
}

const SETTINGS_ON = {
  showOperator: true,
  showSupervisor: true,
  showLocation: true,
  showApproxWorkDone: true,
  showBillableQty: true,
  showFuel: true,
  showRemarks: true,
  showFiles: true,
  showMaterials: true,
  showMeterReadings: true,
  showBreakdownHours: true,
  approvalEnabled: false,
};

async function setSettings(ctx: Ctx, patch: Partial<typeof SETTINGS_ON>) {
  const response = await saveSettings(
    post(SETTINGS, { projectId: ctx.projectId, ...SETTINGS_ON, ...patch }),
  );
  expect(response.status, await response.clone().text()).toBe(StatusCodes.OK);
}

async function inStock(ctx: Ctx, materialId: string): Promise<string | null> {
  const response = await inventory(
    get(
      `${ORIGIN}/api/construction/procurement/inventory?locationKind=project&locationId=${ctx.projectId}`,
    ),
  );
  const rows = (
    await json<{ items: { materialId: string; inStock: string }[] }>(response)
  ).items;
  return rows.find((row) => row.materialId === materialId)?.inStock ?? null;
}

function dispatched(spy: { mock: { calls: unknown[][] } }, type: string) {
  return spy.mock.calls
    .flatMap(([events]) => events as DomainEvent[])
    .filter((event) => event.type === type) as (DomainEvent &
    Record<string, unknown>)[];
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Equipment Usage sheets (CM-604)", () => {
  it("saves an owned hourly sheet from time shifts, numbers it, lists it with totals", async () => {
    const ctx = await setup();
    const sheet = await saved(ctx, ctx.jcb, {
      fuelQty: "60",
      breakdownHours: "0.5",
    });
    expect(sheet.number).toMatch(/^EU\//);
    expect(sheet).toMatchObject({
      sheetDate: YESTERDAY,
      ownership: "owned",
      utilisationBasis: "hourly",
      workingTimeMethod: "time_shifts",
      operatorName: "Ramesh K",
      timeShifts: [
        { startTime: "08:00", endTime: "12:00", minutes: 240 },
        { startTime: "13:00", endTime: "17:30", minutes: 270 },
      ],
      shiftHours: "8.50",
      usageHours: "8.50",
      idleHours: "1.00",
      breakdownHours: "0.50",
      fuelQty: "60.000",
      fuelBorneBy: "company",
      // 60 L ÷ 8.5 h = 7.06 L/h > 6.5
      fuelOverrun: true,
      unitRate: null,
      hireCost: null,
      approvalStatus: "not_required",
    });
    await saved(ctx, ctx.jcb, {
      shift: "shift_2",
      timeShifts: [{ startTime: "18:00", endTime: "20:00" }],
    });
    const page = await json<{
      items: Sheet[];
      total: number;
      totals: { usageHours: string; idleHours: string };
      facets: { equipment: { id: string }[] };
    }>(await list(get(`${BASE}?projectId=${ctx.projectId}`)));
    expect(page.total).toBe(2);
    expect(page.totals).toMatchObject({
      usageHours: "10.50",
      idleHours: "2.00",
    });
    expect(page.facets.equipment.map((item) => item.id)).toEqual([ctx.jcb.id]);
    const owned = await json<{ total: number }>(
      await list(get(`${BASE}?projectId=${ctx.projectId}&ownership=rented`)),
    );
    expect(owned.total).toBe(0);
  });

  it("computes a rented hourly sheet's hire from the meter; hides it without Financial", async () => {
    const ctx = await setup();
    const spy = vi.spyOn(InProcessEventDispatcher.prototype, "dispatch");
    const sheet = await saved(ctx, ctx.excavator, {
      timeShifts: [],
      openingReading: "1200",
      closingReading: "1207.5",
      idleHours: "0.5",
      fuelQty: "40",
      fuelBorneBy: "hire_party",
    });
    // ₹1,200/h × (7.5 h + 0.5 h chargeable idle) = ₹9,600
    expect(sheet).toMatchObject({
      ownership: "rented",
      usageHours: "7.50",
      meterDelta: "7.50",
      unitRate: 120_000,
      billableQty: "8.000",
      hireCost: 960_000,
      fuelBorneBy: "hire_party",
    });
    const accrued = dispatched(spy, "EquipmentHireAccrued");
    expect(accrued).toHaveLength(1);
    expect(accrued[0]).toMatchObject({
      sheetId: sheet.id,
      equipmentId: ctx.excavator.id,
      hirePartyId: ctx.hireParty,
      hireCost: 960_000n,
    });

    // A member without Financial sees no money and cannot send a rate…
    actAs(await member(ctx, ["read", "create", "update"]));
    const seen = await detail(sheet.id);
    expect(seen).toMatchObject({
      unitRate: null,
      billableQty: null,
      hireCost: null,
      equipment: { hireRate: null },
    });
    const withRate = await save(ctx, ctx.excavator, {
      sheetDate: TODAY,
      timeShifts: [],
      openingReading: "1207.5",
      closingReading: "1215",
      unitRate: 100_000,
    });
    expect(await refusal(withRate)).toMatchObject({
      status: StatusCodes.FORBIDDEN,
      code: "PERMISSION_DENIED",
    });
    // …but their sheet still stores the hire cost from the defaults.
    const theirs = await saved(ctx, ctx.excavator, {
      sheetDate: TODAY,
      timeShifts: [],
      openingReading: "1207.5",
      closingReading: "1215",
      idleHours: "0",
    });
    expect(theirs.hireCost).toBeNull();
    const row =
      await prisma.constructionSiteWorkEquipmentUsageSheet.findUniqueOrThrow({
        where: { id: theirs.id },
      });
    expect(row.hireCost).toBe(900_000n);
    expect(row.unitRate).toBe(120_000n);

    // With Financial an override is taken.
    actAs(ctx.owner);
    const overridden = await edit(ctx, sheet, ctx.excavator, {
      timeShifts: [],
      openingReading: "1200",
      closingReading: "1207.5",
      idleHours: "0.5",
      billableQty: "10",
      unitRate: 110_000,
    });
    expect(overridden.status).toBe(StatusCodes.OK);
    expect(await json<Sheet>(overridden)).toMatchObject({
      billableQty: "10.000",
      unitRate: 110_000,
      hireCost: 1_100_000,
    });
  });

  it("records Km and Trip equipment", async () => {
    const ctx = await setup();
    const tipper = await equipmentAdd(
      ctx.owner,
      equipmentOwnedInput({
        projectId: ctx.projectId,
        placedOn: PLACED,
        name: "Tipper",
        utilisationBasis: "km",
        workingTimeMethod: "meter_reading",
        targetUnit: "km_per_day",
        targetValue: "120",
        expectedFuelEfficiency: "0.25",
      }),
    );
    const dumper = await equipmentAdd(
      ctx.owner,
      equipmentOwnedInput({
        projectId: ctx.projectId,
        placedOn: PLACED,
        name: "Dumper",
        utilisationBasis: "trip",
        workingTimeMethod: "time_shifts",
        targetUnit: "trips_per_day",
        targetValue: "20",
        expectedFuelEfficiency: null,
      }),
    );
    actAs(ctx.owner);
    const km = await saved(ctx, tipper, {
      timeShifts: [],
      openingReading: "45210",
      closingReading: "45296.4",
      fuelQty: "20",
    });
    expect(km).toMatchObject({
      distanceKm: "86.40",
      usageHours: null,
      // 20 L ÷ 86.4 km = 0.23 ≤ 0.25
      fuelOverrun: false,
    });
    const trips = await saved(ctx, dumper, { trips: 14 });
    expect(trips).toMatchObject({ trips: 14, usageHours: null });
    const noTrips = await save(ctx, dumper, { shift: "shift_2" });
    expect(await refusal(noTrips)).toMatchObject({
      status: StatusCodes.BAD_REQUEST,
      code: "TRIPS_REQUIRED",
    });
  });

  it("refuses more than 24 hours, overlapping shifts and a closing below the opening", async () => {
    const ctx = await setup();
    const over = await save(ctx, ctx.jcb, {
      timeShifts: [{ startTime: "00:00", endTime: "20:00" }],
      idleHours: "3",
      breakdownHours: "1.5",
    });
    expect(await refusal(over)).toMatchObject({
      status: StatusCodes.BAD_REQUEST,
      code: "SHEET_HOURS_OVER_24",
    });
    const overlap = await save(ctx, ctx.jcb, {
      timeShifts: [
        { startTime: "22:00", endTime: "02:00" },
        { startTime: "01:00", endTime: "03:00" },
      ],
    });
    expect(await refusal(overlap)).toMatchObject({
      code: "TIME_SHIFTS_OVERLAP",
    });
    const meter = await save(ctx, ctx.excavator, {
      timeShifts: [],
      openingReading: "100",
      closingReading: "99",
    });
    expect(await refusal(meter)).toMatchObject({
      code: "METER_CLOSING_BELOW_OPENING",
      field: "closingReading",
    });
  });

  it("allows one sheet per equipment, date and shift", async () => {
    const ctx = await setup();
    await saved(ctx, ctx.jcb);
    const again = await save(ctx, ctx.jcb);
    expect(await refusal(again)).toMatchObject({
      status: StatusCodes.CONFLICT,
      code: "EQUIPMENT_SHEET_EXISTS",
    });
    const second = await saved(ctx, ctx.jcb, {
      shift: "shift_2",
      timeShifts: [{ startTime: "18:00", endTime: "22:00" }],
    });
    const moved = await edit(ctx, second, ctx.jcb, { shift: "shift_1" });
    expect(await refusal(moved)).toMatchObject({
      code: "EQUIPMENT_SHEET_EXISTS",
    });
  });

  it("refuses equipment in maintenance, transferred away or marked unavailable", async () => {
    const ctx = await setup();
    const inShop = await equipmentLogMaintenance(ctx.owner, ctx.jcb, {
      startDate: addDays(TODAY, -3),
    });
    actAs(ctx.owner);
    expect(await refusal(await save(ctx, inShop))).toMatchObject({
      status: StatusCodes.CONFLICT,
      code: "EQUIPMENT_IN_MAINTENANCE",
      field: "equipmentId",
    });
    // Before the maintenance began it was free.
    await saved(ctx, inShop, { sheetDate: addDays(TODAY, -5) });

    const moved = await equipmentTransfer(ctx.owner, ctx.excavator, {
      toProjectId: ctx.otherProject,
      movementDate: addDays(TODAY, -2),
    });
    actAs(ctx.owner);
    expect(
      await refusal(
        await save(ctx, moved, {
          timeShifts: [],
          openingReading: "1",
          closingReading: "2",
        }),
      ),
    ).toMatchObject({ code: "EQUIPMENT_NOT_ON_PROJECT" });

    const roller = await equipmentAdd(
      ctx.owner,
      equipmentOwnedInput({ projectId: ctx.projectId, placedOn: PLACED }),
    );
    const marked = await json<EquipmentJson>(
      await availability(
        post(`${EQUIPMENT_API}/${roller.id}/availability`, {
          expectedUpdatedAt: roller.updatedAt,
          available: false,
        }),
        params(roller.id),
      ),
    );
    expect(marked.availableForEntry).toBe(false);
    expect(
      await refusal(
        await save(ctx, roller, {
          openingReading: "1",
          closingReading: "9",
        }),
      ),
    ).toMatchObject({ code: "EQUIPMENT_UNAVAILABLE" });
  });

  it("refuses a transfer dated before the equipment's last sheet at the Project", async () => {
    const ctx = await setup();
    await saved(ctx, ctx.jcb);
    const fresh = await json<EquipmentJson>(await fetchEquipment(ctx.jcb.id));
    actAs(ctx.owner);
    await expect(
      equipmentTransfer(ctx.owner, fresh, {
        toProjectId: ctx.otherProject,
        movementDate: addDays(TODAY, -2),
      }),
    ).rejects.toThrow(/TRANSFER_BEFORE_LAST_SHEET/);
    const done = await equipmentTransfer(ctx.owner, fresh, {
      toProjectId: ctx.otherProject,
      movementDate: YESTERDAY,
    });
    expect(done.currentProject?.id).toBe(ctx.otherProject);
  });

  it("posts material lines as Consumed stock and refuses STOCK_INSUFFICIENT", async () => {
    const ctx = await setup();
    const grease = await addMaterial(ctx.ws, ctx.by, { name: "Grease" });
    await addOpeningStock(
      ctx.ws,
      ctx.by,
      { kind: "project", id: ctx.projectId },
      grease.id,
      "10",
    );
    actAs(ctx.owner);
    const sheet = await saved(ctx, ctx.jcb, {
      materials: [{ materialId: grease.id, quantity: "4" }],
    });
    expect(await inStock(ctx, grease.id)).toBe("6.000");
    const stock = await json<{ stock: Record<string, string> }>(
      await availableStock(
        get(
          `${BASE}/available-stock?projectId=${ctx.projectId}&date=${YESTERDAY}&materialIds=${grease.id}&excludeSheetId=${sheet.id}`,
        ),
      ),
    );
    expect(stock.stock[grease.id]).toBe("10.000");
    const tooMuch = await save(ctx, ctx.jcb, {
      shift: "shift_2",
      timeShifts: [{ startTime: "18:00", endTime: "20:00" }],
      materials: [{ materialId: grease.id, quantity: "7" }],
    });
    expect(await refusal(tooMuch)).toMatchObject({
      status: StatusCodes.CONFLICT,
      code: "STOCK_INSUFFICIENT",
    });
    const removed = await remove(
      post(`${BASE}/${sheet.id}/delete`, {
        expectedUpdatedAt: sheet.updatedAt,
      }),
      params(sheet.id),
    );
    expect(removed.status).toBe(StatusCodes.NO_CONTENT);
    expect(await inStock(ctx, grease.id)).toBe("10.000");
    expect(
      (await getOne(get(`${BASE}/${sheet.id}`), params(sheet.id))).status,
    ).toBe(StatusCodes.NOT_FOUND);
  });

  it("moves through approval; Save & Approve needs Approve; approval accrues hire", async () => {
    const ctx = await setup();
    await setSettings(ctx, { approvalEnabled: true });
    const spy = vi.spyOn(InProcessEventDispatcher.prototype, "dispatch");
    const rented = await saved(ctx, ctx.excavator, {
      timeShifts: [],
      openingReading: "10",
      closingReading: "18",
    });
    expect(rented.approvalStatus).toBe("pending");
    expect(dispatched(spy, "EquipmentHireAccrued")).toHaveLength(0);
    const approved = await approve(
      post(`${BASE}/${rented.id}/approve`, {}),
      params(rented.id),
    );
    expect((await json<Sheet>(approved)).approvalStatus).toBe("approved");
    expect(dispatched(spy, "EquipmentHireAccrued")).toHaveLength(1);
    expect(dispatched(spy, "document.approved")).toHaveLength(1);

    const owned = await saved(ctx, ctx.jcb);
    const noReason = await reject(
      post(`${BASE}/${owned.id}/reject`, { reason: " " }),
      params(owned.id),
    );
    expect((await refusal(noReason)).code).toBe("REJECTION_REASON_REQUIRED");
    const rejected = await json<Sheet>(
      await reject(
        post(`${BASE}/${owned.id}/reject`, {
          reason: "Hours do not match the log book",
        }),
        params(owned.id),
      ),
    );
    expect(rejected).toMatchObject({
      approvalStatus: "rejected",
      rejectionReason: "Hours do not match the log book",
    });
    const again = await approve(
      post(`${BASE}/${owned.id}/approve`, {}),
      params(owned.id),
    );
    expect(await refusal(again)).toMatchObject({
      status: StatusCodes.CONFLICT,
      code: "EQUIPMENT_SHEET_NOT_PENDING",
    });
    const resubmitted = await edit(ctx, rejected, ctx.jcb, { idleHours: "0" });
    expect((await json<Sheet>(resubmitted)).approvalStatus).toBe("pending");

    actAs(await member(ctx, ["read", "create"]));
    const noApprove = await save(ctx, ctx.jcb, {
      shift: "shift_3",
      timeShifts: [{ startTime: "20:00", endTime: "22:00" }],
      approve: true,
    });
    expect((await refusal(noApprove)).status).toBe(StatusCodes.FORBIDDEN);
    actAs(ctx.owner);
    const born = await saved(ctx, ctx.jcb, {
      shift: "shift_3",
      timeShifts: [{ startTime: "20:00", endTime: "22:00" }],
      approve: true,
    });
    expect(born.approvalStatus).toBe("approved");
  });

  it("decides in bulk, all or none", async () => {
    const ctx = await setup();
    await setSettings(ctx, { approvalEnabled: true });
    const a = await saved(ctx, ctx.jcb);
    const b = await saved(ctx, ctx.jcb, {
      shift: "shift_2",
      timeShifts: [{ startTime: "18:00", endTime: "20:00" }],
    });
    await approve(post(`${BASE}/${b.id}/approve`, {}), params(b.id));
    const refused = await bulkApprove(
      post(`${BASE}/bulk-approve`, {
        projectId: ctx.projectId,
        ids: [a.id, b.id],
      }),
    );
    expect(await refusal(refused)).toMatchObject({
      status: StatusCodes.CONFLICT,
      code: "BULK_DECISION_REFUSED",
    });
    expect((await detail(a.id)).approvalStatus).toBe("pending");
    const c = await saved(ctx, ctx.jcb, {
      shift: "shift_3",
      timeShifts: [{ startTime: "21:00", endTime: "23:00" }],
    });
    const rejected = await bulkReject(
      post(`${BASE}/bulk-reject`, {
        projectId: ctx.projectId,
        ids: [a.id, c.id],
        reason: "Log book missing",
      }),
    );
    expect(await json(rejected)).toEqual({ decided: 2 });
    expect((await detail(c.id)).approvalStatus).toBe("rejected");
  });

  it("refuses a stale edit (409 EQUIPMENT_SHEET_CHANGED) and keeps the equipment", async () => {
    const ctx = await setup();
    const sheet = await saved(ctx, ctx.jcb);
    const first = await edit(ctx, sheet, ctx.jcb, { operatorName: "Suresh" });
    expect(first.status).toBe(StatusCodes.OK);
    const second = await edit(ctx, sheet, ctx.jcb, { operatorName: "Mani" });
    expect(await refusal(second)).toMatchObject({
      status: StatusCodes.CONFLICT,
      code: "EQUIPMENT_SHEET_CHANGED",
    });
  });

  it("applies the back-dated policy and refuses future dates", async () => {
    const ctx = await setup();
    await prisma.constructionOrganizationBackdatedEntryPolicy.create({
      data: {
        id: newId(),
        workspaceId: ctx.ws,
        createDays: 0,
        createOverrideDesignationIds: [],
        editDays: 0,
        editOverrideDesignationIds: [],
        modules: {
          equipment_usage: {
            mode: "custom",
            create: { days: 3, overrideDesignationIds: [] },
            edit: { days: 3, overrideDesignationIds: [] },
          },
        },
        createdBy: ctx.by,
        updatedBy: ctx.by,
      },
    });
    actAs(await member(ctx, ["read", "create", "update"]));
    const old = await save(ctx, ctx.jcb, { sheetDate: addDays(TODAY, -10) });
    expect(await refusal(old)).toMatchObject({
      status: StatusCodes.FORBIDDEN,
      code: "BACKDATED_CREATE_BLOCKED",
    });
    const recent = await saved(ctx, ctx.jcb, { sheetDate: addDays(TODAY, -2) });
    const moved = await edit(ctx, recent, ctx.jcb, {
      sheetDate: addDays(TODAY, -10),
    });
    expect((await refusal(moved)).code).toBe("BACKDATED_EDIT_BLOCKED");
    const future = await save(ctx, ctx.jcb, { sheetDate: addDays(TODAY, 1) });
    expect(await refusal(future)).toMatchObject({
      status: StatusCodes.BAD_REQUEST,
      code: "SHEET_DATE_IN_FUTURE",
    });
  });

  it("opens from the last closing reading and shows the gap", async () => {
    const ctx = await setup();
    const first = await saved(ctx, ctx.excavator, {
      sheetDate: addDays(TODAY, -2),
      timeShifts: [],
      openingReading: "1200",
      closingReading: "1208",
    });
    expect(first.previousClosing).toBeNull();
    const options = await json<{
      items: { id: string; lastClosingReading: { reading: string } | null }[];
    }>(
      await sheetOptions(
        get(
          `${EQUIPMENT_API}/sheet-options?projectId=${ctx.projectId}&date=${YESTERDAY}`,
        ),
      ),
    );
    expect(
      options.items.find((item) => item.id === ctx.excavator.id)
        ?.lastClosingReading?.reading,
    ).toBe("1208.00");
    const second = await saved(ctx, ctx.excavator, {
      timeShifts: [],
      openingReading: "1210",
      closingReading: "1216",
    });
    expect(second).toMatchObject({
      previousClosing: { reading: "1208.00", sheetDate: addDays(TODAY, -2) },
      meterGap: "2.00",
    });
  });

  it("checks the supervisor, Contractor and Department; offers them in the form options", async () => {
    const ctx = await setup();
    const department = await worksheetDepartment(ctx.ws, ctx.by, {
      name: "Earthwork",
    });
    const contractor = await worksheetContractor(ctx.ws, ctx.by, {
      name: "Velan Earthmovers",
      projectIds: [ctx.projectId],
      departmentIds: [department],
    });
    const offProject = await worksheetContractor(ctx.ws, ctx.by, {
      departmentIds: [department],
    });
    const supervisor = await member(ctx, ["read"]);
    const stranger = await member(ctx, ["read"], false);
    actAs(ctx.owner);
    const options = await json<{
      supervisors: { userId: string }[];
      contractors: { id: string; departmentIds: string[] }[];
      settings: { approvalEnabled: boolean; updatedAt: string | null };
    }>(
      await formOptions(get(`${BASE}/form-options?projectId=${ctx.projectId}`)),
    );
    expect(options.supervisors.map((row) => row.userId)).toEqual(
      expect.arrayContaining([supervisor.userId, ctx.by]),
    );
    expect(options.supervisors.map((row) => row.userId)).not.toContain(
      stranger.userId,
    );
    expect(options.contractors).toEqual([
      expect.objectContaining({ id: contractor, departmentIds: [department] }),
    ]);
    expect(options.settings).toMatchObject({
      approvalEnabled: false,
      updatedAt: null,
    });

    const sheet = await saved(ctx, ctx.jcb, {
      supervisorUserId: supervisor.userId,
      contractorId: contractor,
      departmentId: department,
    });
    expect(sheet).toMatchObject({
      supervisor: { userId: supervisor.userId },
      contractor: { id: contractor, name: "Velan Earthmovers" },
      department: { id: department, name: "Earthwork" },
    });
    const wrongSupervisor = await save(ctx, ctx.jcb, {
      shift: "shift_2",
      timeShifts: [{ startTime: "18:00", endTime: "20:00" }],
      supervisorUserId: stranger.userId,
    });
    expect((await refusal(wrongSupervisor)).code).toBe("SUPERVISOR_NOT_FOUND");
    const notOnProject = await save(ctx, ctx.jcb, {
      shift: "shift_2",
      timeShifts: [{ startTime: "18:00", endTime: "20:00" }],
      contractorId: offProject,
    });
    expect((await refusal(notOnProject)).code).toBe(
      "CONTRACTOR_NOT_ON_PROJECT",
    );
    const departmentAlone = await save(ctx, ctx.jcb, {
      shift: "shift_2",
      timeShifts: [{ startTime: "18:00", endTime: "20:00" }],
      departmentId: department,
    });
    expect((await refusal(departmentAlone)).code).toBe("CONTRACTOR_REQUIRED");
  });

  it("saves the settings; hidden fields are neither validated nor stored", async () => {
    const ctx = await setup();
    const defaults = await json<{ showFuel: boolean; updatedAt: null }>(
      await getSettings(get(`${SETTINGS}?projectId=${ctx.projectId}`)),
    );
    expect(defaults).toMatchObject({ showFuel: true, updatedAt: null });
    await setSettings(ctx, {
      showOperator: false,
      showFuel: false,
      showBreakdownHours: false,
    });
    const stale = await saveSettings(
      post(SETTINGS, {
        projectId: ctx.projectId,
        ...SETTINGS_ON,
        expectedUpdatedAt: null,
      }),
    );
    expect((await refusal(stale)).code).toBe(
      "EQUIPMENT_SHEET_SETTINGS_CHANGED",
    );
    const sheet = await saved(ctx, ctx.jcb, {
      operatorName: "x".repeat(10),
      fuelQty: "not a number",
      breakdownHours: "99",
    });
    expect(sheet).toMatchObject({
      operatorName: null,
      fuelQty: null,
      breakdownHours: "0.00",
    });
    actAs(await member(ctx, ["read", "create"]));
    const denied = await saveSettings(
      post(SETTINGS, { projectId: ctx.projectId, ...SETTINGS_ON }),
    );
    expect(denied.status).toBe(StatusCodes.FORBIDDEN);
  });

  it("is on /api/docs", async () => {
    const document = await json<{ paths: Record<string, unknown> }>(
      getOpenApi(),
    );
    for (const path of [
      "/api/construction/site-work/equipment-sheets",
      "/api/construction/site-work/equipment-sheets/{id}",
      "/api/construction/site-work/equipment-sheets/{id}/update",
      "/api/construction/site-work/equipment-sheets/{id}/delete",
      "/api/construction/site-work/equipment-sheets/{id}/approve",
      "/api/construction/site-work/equipment-sheets/{id}/reject",
      "/api/construction/site-work/equipment-sheets/bulk-approve",
      "/api/construction/site-work/equipment-sheets/bulk-reject",
      "/api/construction/site-work/equipment-sheets/form-options",
      "/api/construction/site-work/equipment-sheets/available-stock",
      "/api/construction/site-work/settings/equipment-sheets",
    ])
      expect(document.paths[path], path).toBeDefined();
  });
});

function fetchEquipment(id: string): Promise<Response> {
  return getEquipment(get(`${EQUIPMENT_API}/${id}`), params(id));
}
