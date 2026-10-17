import { Prisma, prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GET as inventory } from "@/app/api/construction/procurement/inventory/route";
import { POST as updateWing } from "@/app/api/construction/projects/projects/[id]/wings/[wingId]/update/route";
import { POST as createWing } from "@/app/api/construction/projects/projects/[id]/wings/route";
import { GET as getOpenApi } from "@/app/api/openapi.json/route";
import {
  generateWingFloors,
  wingConfig,
} from "@/src/projects/domain/wing-generator";
import type { Flag } from "@/src/shared-kernel/access";
import { addDays, todayIn } from "@/src/shared-kernel/calendar-date";
import {
  InProcessEventDispatcher,
  type DomainEvent,
} from "@/src/shared-kernel/events";
import { newId } from "@/src/shared-kernel/ids";
import { actAs, addMember, addProject, newCompany } from "@/test/companies";
import { addMaterial, addOpeningStock, addUnit } from "@/test/procurement";
import {
  worksheetContractor,
  worksheetDepartment,
  worksheetLabourAttendance,
  worksheetLabourCategory,
  worksheetLocation,
  worksheetVendorAttendance,
  worksheetWorkType,
} from "@/test/site-work";

import {
  GET as getSettings,
  POST as saveSettings,
} from "../settings/worksheets/route";
import { POST as approve } from "./[id]/approve/route";
import { POST as remove } from "./[id]/delete/route";
import { POST as reject } from "./[id]/reject/route";
import { GET as getOne } from "./[id]/route";
import { POST as update } from "./[id]/update/route";
import { GET as attendance } from "./attendance/route";
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
const BASE = `${ORIGIN}/api/construction/site-work/worksheets`;
const SETTINGS = `${ORIGIN}/api/construction/site-work/settings/worksheets`;
const TODAY = todayIn("Asia/Kolkata");
const MENU = "site_work.daily_worksheet";

type Sheet = {
  id: string;
  number: string;
  projectId: string;
  sheetDate: string;
  shift: string;
  contractor: { id: string; name: string | null };
  department: { id: string; name: string | null };
  workType: { id: string; name: string | null } | null;
  skilledCount: number | null;
  unskilledCount: number | null;
  approxWorkQty: string | null;
  approxWorkUnit: { id: string; name: string | null } | null;
  siteLocation: Record<string, unknown> | null;
  remark: string | null;
  approvalStatus: string;
  rejectionReason: string | null;
  duplicatedFromId: string | null;
  createdBy: { userId: string; name: string | null };
  updatedAt: string;
  materials: { materialId: string; materialName: string; quantity: string }[];
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

async function code(response: Response): Promise<string> {
  return (await json<{ code: string }>(response)).code;
}

async function setup() {
  const company = await newCompany();
  const ws = company.workspaceId;
  const by = company.ownerId;
  const owner = { userId: by, workspaceId: ws, role: "owner" as const };
  const projectId = await addProject(ws, by, "Anugraha Towers");
  const department = await worksheetDepartment(ws, by, {
    name: "Masonry Crew",
  });
  const otherDepartment = await worksheetDepartment(ws, by, {
    name: "Plumbing Crew",
  });
  const contractor = await worksheetContractor(ws, by, {
    name: "Velan Constructions",
    projectIds: [projectId],
    departmentIds: [department],
  });
  const cement = await addMaterial(ws, by, { name: "Cement OPC 53 Grade" });
  const sand = await addMaterial(ws, by, {
    name: "M Sand",
    uomId: cement.uomId,
  });
  const workType = await worksheetWorkType(
    ws,
    by,
    department,
    [cement.id],
    "Brickwork",
  );
  const unit = await addUnit(ws, by, "sqm");
  const locationId = await worksheetLocation(ws, by, projectId, "Pump house");
  actAs(owner);
  return {
    company,
    ws,
    by,
    owner,
    projectId,
    department,
    otherDepartment,
    contractor,
    cement,
    sand,
    workType,
    unit,
    locationId,
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

function body(ctx: Ctx, patch: Record<string, unknown> = {}) {
  return {
    projectId: ctx.projectId,
    sheetDate: TODAY,
    shift: "shift_1",
    contractorId: ctx.contractor,
    departmentId: ctx.department,
    workTypeId: ctx.workType,
    skilledCount: 4,
    unskilledCount: 6,
    approxWorkQty: "42.5",
    approxWorkUnitId: ctx.unit,
    siteLocation: { type: "location", locationId: ctx.locationId },
    remark: "Brickwork, ground floor east wall",
    materials: [{ materialId: ctx.cement.id, quantity: "30" }],
    ...patch,
  };
}

async function save(ctx: Ctx, patch: Record<string, unknown> = {}) {
  return create(post(BASE, body(ctx, patch)));
}

async function saved(ctx: Ctx, patch: Record<string, unknown> = {}) {
  const response = await save(ctx, patch);
  expect(response.status, await response.clone().text()).toBe(
    StatusCodes.CREATED,
  );
  return json<Sheet>(response);
}

async function edit(ctx: Ctx, sheet: Sheet, patch: Record<string, unknown>) {
  const { projectId: _projectId, ...rest } = body(ctx, patch);
  return update(
    post(`${BASE}/${sheet.id}/update`, {
      ...rest,
      expectedUpdatedAt: sheet.updatedAt,
    }),
    params(sheet.id),
  );
}

async function inStock(ctx: Ctx, materialId: string): Promise<string | null> {
  const response = await inventory(
    get(
      `${ORIGIN}/api/construction/procurement/inventory?locationKind=project&locationId=${ctx.projectId}`,
    ),
  );
  expect(response.status).toBe(StatusCodes.OK);
  const rows = (
    await json<{ items: { materialId: string; inStock: string }[] }>(response)
  ).items;
  return rows.find((row) => row.materialId === materialId)?.inStock ?? null;
}

async function setApproval(ctx: Ctx, approvalEnabled: boolean) {
  const response = await saveSettings(
    post(SETTINGS, {
      projectId: ctx.projectId,
      showLocation: true,
      showWorkType: true,
      showApproxWorkDone: true,
      showLabour: true,
      showMaterials: true,
      showRemark: true,
      showPhotos: true,
      sectionOrder: ["location", "basic", "materials", "other"],
      approvalEnabled,
    }),
  );
  expect(response.status).toBe(StatusCodes.OK);
}

function dispatched(spy: { mock: { calls: unknown[][] } }, type: string) {
  return spy.mock.calls
    .flatMap(([events]) => events as DomainEvent[])
    .filter((event) => event.type === type);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Daily Worksheets", () => {
  it("saves a sheet, numbers it, posts Consumed stock and lowers Current Inventory", async () => {
    const ctx = await setup();
    await addOpeningStock(
      ctx.ws,
      ctx.by,
      { kind: "project", id: ctx.projectId },
      ctx.cement.id,
      "100",
    );
    const sheet = await saved(ctx);
    expect(sheet.number).toMatch(/^WS\//);
    expect(sheet).toMatchObject({
      sheetDate: TODAY,
      shift: "shift_1",
      contractor: { id: ctx.contractor, name: "Velan Constructions" },
      department: { id: ctx.department, name: "Masonry Crew" },
      workType: { id: ctx.workType, name: "Brickwork" },
      skilledCount: 4,
      unskilledCount: 6,
      approxWorkQty: "42.500",
      approxWorkUnit: { id: ctx.unit, name: "sqm" },
      siteLocation: { type: "location", locationId: ctx.locationId },
      approvalStatus: "not_required",
      materials: [
        {
          materialId: ctx.cement.id,
          materialName: "Cement OPC 53 Grade",
          quantity: "30.000",
        },
      ],
      actions: { edit: true, delete: true, approve: false, duplicate: true },
    });
    expect(await inStock(ctx, ctx.cement.id)).toBe("70.000");

    const entries = await prisma.constructionProcurementStockEntry.findMany({
      where: {
        workspaceId: ctx.ws,
        sourceType: "daily_worksheet",
        sourceId: sheet.id,
      },
    });
    expect(entries).toHaveLength(1);

    const read = await getOne(get(`${BASE}/${sheet.id}`), params(sheet.id));
    expect(read.status).toBe(StatusCodes.OK);
    expect((await json<Sheet>(read)).number).toBe(sheet.number);

    const page = await list(get(`${BASE}?projectId=${ctx.projectId}`));
    const listed = await json<{
      total: number;
      items: Sheet[];
      facets: {
        filledBy: { userId: string }[];
        contractors: { id: string; name: string }[];
        departments: { id: string; name: string }[];
      };
    }>(page);
    expect(listed.total).toBe(1);
    expect(listed.facets.contractors).toEqual([
      { id: ctx.contractor, name: "Velan Constructions" },
    ]);
    expect(listed.facets.departments).toEqual([
      { id: ctx.department, name: "Masonry Crew" },
    ]);
    expect(listed.facets.filledBy.map((row) => row.userId)).toEqual([ctx.by]);
  });

  it("refuses the whole save with STOCK_INSUFFICIENT", async () => {
    const ctx = await setup();
    const at = { kind: "project" as const, id: ctx.projectId };
    await addOpeningStock(ctx.ws, ctx.by, at, ctx.cement.id, "10");
    await addOpeningStock(ctx.ws, ctx.by, at, ctx.sand.id, "50");
    const response = await save(ctx, {
      materials: [
        { materialId: ctx.sand.id, quantity: "5" },
        { materialId: ctx.cement.id, quantity: "30" },
      ],
    });
    expect(response.status).toBe(StatusCodes.CONFLICT);
    const error = await json<{
      code: string;
      details: { shortfalls: { materialId: string; shortBy: string }[] };
    }>(response);
    expect(error.code).toBe("STOCK_INSUFFICIENT");
    expect(error.details.shortfalls[0]).toMatchObject({
      materialId: ctx.cement.id,
      shortBy: "20.000",
    });
    expect(await inStock(ctx, ctx.sand.id)).toBe("50.000");
    expect(
      await prisma.constructionSiteWorkWorksheet.count({
        where: { workspaceId: ctx.ws },
      }),
    ).toBe(0);
  });

  it("replaces postings on edit and reverses them on delete", async () => {
    const ctx = await setup();
    await addOpeningStock(
      ctx.ws,
      ctx.by,
      { kind: "project", id: ctx.projectId },
      ctx.cement.id,
      "100",
    );
    const sheet = await saved(ctx);
    expect(await inStock(ctx, ctx.cement.id)).toBe("70.000");

    // Available stock for the edit adds the sheet's own 30 back.
    const stock = await availableStock(
      get(
        `${BASE}/available-stock?projectId=${ctx.projectId}&date=${TODAY}&materialIds=${ctx.cement.id}&excludeWorksheetId=${sheet.id}`,
      ),
    );
    expect(await json<{ stock: Record<string, string> }>(stock)).toEqual({
      stock: { [ctx.cement.id]: "100.000" },
    });

    const edited = await edit(ctx, sheet, {
      materials: [{ materialId: ctx.cement.id, quantity: "55.5" }],
    });
    expect(edited.status).toBe(StatusCodes.OK);
    const after = await json<Sheet>(edited);
    expect(after.materials[0]?.quantity).toBe("55.500");
    expect(await inStock(ctx, ctx.cement.id)).toBe("44.500");

    // An edit beyond the stock is refused and changes nothing.
    const tooMuch = await edit(ctx, after, {
      materials: [{ materialId: ctx.cement.id, quantity: "101" }],
    });
    expect(tooMuch.status).toBe(StatusCodes.CONFLICT);
    expect(await code(tooMuch)).toBe("STOCK_INSUFFICIENT");
    expect(await inStock(ctx, ctx.cement.id)).toBe("44.500");

    const stale = await remove(
      post(`${BASE}/${sheet.id}/delete`, {
        expectedUpdatedAt: sheet.updatedAt,
      }),
      params(sheet.id),
    );
    expect(stale.status).toBe(StatusCodes.CONFLICT);
    expect(await code(stale)).toBe("WORKSHEET_CHANGED");

    const deleted = await remove(
      post(`${BASE}/${sheet.id}/delete`, {
        expectedUpdatedAt: after.updatedAt,
      }),
      params(sheet.id),
    );
    expect(deleted.status).toBe(StatusCodes.NO_CONTENT);
    expect(await inStock(ctx, ctx.cement.id)).toBe("100.000");
    const gone = await getOne(get(`${BASE}/${sheet.id}`), params(sheet.id));
    expect(gone.status).toBe(StatusCodes.NOT_FOUND);
  });

  it("refuses a stale edit with 409 WORKSHEET_CHANGED", async () => {
    const ctx = await setup();
    const sheet = await saved(ctx, { materials: [] });
    const first = await edit(ctx, sheet, {
      remark: "First edit",
      materials: [],
    });
    expect(first.status).toBe(StatusCodes.OK);
    const second = await edit(ctx, sheet, {
      remark: "Second edit",
      materials: [],
    });
    expect(second.status).toBe(StatusCodes.CONFLICT);
    expect(await code(second)).toBe("WORKSHEET_CHANGED");
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
          daily_worksheet: {
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
    const old = await save(ctx, {
      sheetDate: addDays(TODAY, -10),
      materials: [],
    });
    expect(old.status).toBe(StatusCodes.FORBIDDEN);
    expect(await code(old)).toBe("BACKDATED_CREATE_BLOCKED");
    const recent = await saved(ctx, {
      sheetDate: addDays(TODAY, -2),
      materials: [],
    });
    const moved = await edit(ctx, recent, {
      sheetDate: addDays(TODAY, -10),
      materials: [],
    });
    expect(moved.status).toBe(StatusCodes.FORBIDDEN);
    expect(await code(moved)).toBe("BACKDATED_EDIT_BLOCKED");
    const future = await save(ctx, {
      sheetDate: addDays(TODAY, 1),
      materials: [],
    });
    expect(future.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await code(future)).toBe("SHEET_DATE_IN_FUTURE");
  });

  it("checks the Contractor, Department, Work Type and the required fields", async () => {
    const ctx = await setup();
    const elsewhere = await worksheetContractor(ctx.ws, ctx.by, {
      departmentIds: [ctx.department],
    });
    const offProject = await save(ctx, { contractorId: elsewhere });
    expect(offProject.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await json(offProject)).toMatchObject({
      code: "CONTRACTOR_NOT_ON_PROJECT",
      details: { field: "contractorId" },
    });

    const notTheirs = await save(ctx, {
      departmentId: ctx.otherDepartment,
      workTypeId: null,
    });
    expect(notTheirs.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await json(notTheirs)).toMatchObject({
      code: "DEPARTMENT_NOT_CONTRACTORS",
      details: { field: "departmentId" },
    });

    const plumbing = await worksheetWorkType(
      ctx.ws,
      ctx.by,
      ctx.otherDepartment,
    );
    const wrongType = await save(ctx, { workTypeId: plumbing });
    expect(await code(wrongType)).toBe("WORK_TYPE_NOT_DEPARTMENTS");

    const noHeads = await save(ctx, { skilledCount: 0, unskilledCount: 0 });
    expect(await code(noHeads)).toBe("LABOUR_COUNT_REQUIRED");
    const noUnit = await save(ctx, { approxWorkUnitId: null });
    expect(await code(noUnit)).toBe("APPROX_WORK_UNIT_REQUIRED");
    const noPlace = await save(ctx, { siteLocation: null });
    expect(await code(noPlace)).toBe("LOCATION_REQUIRED");
    const foreignPlace = await save(ctx, {
      siteLocation: { type: "location", locationId: newId() },
    });
    expect(await code(foreignPlace)).toBe("LOCATION_NOT_ON_PROJECT");
    const twice = await save(ctx, {
      materials: [
        { materialId: ctx.cement.id, quantity: "1" },
        { materialId: ctx.cement.id, quantity: "2" },
      ],
    });
    expect(await code(twice)).toBe("MATERIAL_REPEATED");
    const tooLong = await save(ctx, { remark: "x".repeat(501) });
    expect(tooLong.status).toBe(StatusCodes.BAD_REQUEST);
  });

  it("asks for a location only when the Project has a place to pick", async () => {
    const ctx = await setup();
    // A new Project: no Wings, Amenities, Common Developments or Locations.
    const bare = await addProject(ctx.ws, ctx.by, "Compound wall, Guindy");
    await prisma.constructionMastersContractorProject.create({
      data: { contractorId: ctx.contractor, projectId: bare },
    });
    const free = await save(ctx, {
      projectId: bare,
      siteLocation: null,
      materials: [],
    });
    expect(free.status, await free.clone().text()).toBe(StatusCodes.CREATED);
    const freeSheet = await json<Sheet>(free);
    expect(freeSheet.siteLocation).toBeNull();
    // No location is SQL NULL, never `{}`.
    const stored = await prisma.$queryRaw<{ empty: boolean }[]>(
      Prisma.sql`SELECT site_location IS NULL AS empty
        FROM construction_site_work.worksheets WHERE id = ${freeSheet.id}::uuid`,
    );
    expect(stored[0]?.empty).toBe(true);

    // Once it has a Wing, the location is required again.
    const config = {
      floors: 1,
      startNumber: 1,
      unitsPerFloor: 1,
      basements: 0,
    };
    const floors = generateWingFloors(
      "commercial",
      wingConfig("commercial", config),
    ).map((floor) => ({
      kind: floor.kind,
      name: floor.name,
      units: floor.units.map((name) => ({ name })),
    }));
    const wing = await createWing(
      post(`${ORIGIN}/api/construction/projects/projects/${bare}/wings`, {
        type: "commercial",
        name: "Wing A",
        config,
        floors,
      }),
      params(bare),
    );
    expect(wing.status).toBe(StatusCodes.CREATED);
    const required = await save(ctx, {
      projectId: bare,
      siteLocation: null,
      materials: [],
    });
    expect(required.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await code(required)).toBe("LOCATION_REQUIRED");
  });

  it("neither validates nor stores hidden sections, and orders the sections", async () => {
    const ctx = await setup();
    const defaults = await json<{
      updatedAt: string | null;
      sectionOrder: string[];
    }>(await getSettings(get(`${SETTINGS}?projectId=${ctx.projectId}`)));
    expect(defaults).toMatchObject({
      updatedAt: null,
      sectionOrder: ["location", "basic", "materials", "other"],
    });
    const response = await saveSettings(
      post(SETTINGS, {
        projectId: ctx.projectId,
        showLocation: false,
        showWorkType: false,
        showApproxWorkDone: false,
        showLabour: false,
        showMaterials: false,
        showRemark: false,
        showPhotos: false,
        sectionOrder: ["basic", "other", "materials", "location"],
        approvalEnabled: false,
        expectedUpdatedAt: null,
      }),
    );
    expect(response.status).toBe(StatusCodes.OK);
    const settings = await json<{ updatedAt: string; sectionOrder: string[] }>(
      response,
    );
    expect(settings.sectionOrder).toEqual([
      "basic",
      "other",
      "materials",
      "location",
    ]);

    const sheet = await saved(ctx, {
      siteLocation: null,
      skilledCount: 0,
      unskilledCount: 0,
      approxWorkQty: "abc",
      remark: "x".repeat(400),
      workTypeId: newId(),
      materials: [{ materialId: ctx.cement.id, quantity: "999" }],
    });
    expect(sheet).toMatchObject({
      siteLocation: null,
      workType: null,
      skilledCount: null,
      approxWorkQty: null,
      remark: null,
      materials: [],
    });

    const stale = await saveSettings(
      post(SETTINGS, {
        projectId: ctx.projectId,
        showLocation: true,
        showWorkType: true,
        showApproxWorkDone: true,
        showLabour: true,
        showMaterials: true,
        showRemark: true,
        showPhotos: true,
        sectionOrder: ["location", "basic", "materials", "other"],
        approvalEnabled: true,
        expectedUpdatedAt: null,
      }),
    );
    expect(stale.status).toBe(StatusCodes.CONFLICT);
    expect(await code(stale)).toBe("WORKSHEET_SETTINGS_CHANGED");

    actAs(await member(ctx, ["read", "create"]));
    const denied = await saveSettings(
      post(SETTINGS, {
        ...settings,
        projectId: ctx.projectId,
        approvalEnabled: true,
      }),
    );
    expect(denied.status).toBe(StatusCodes.FORBIDDEN);
  });

  it("moves through approval: not required, pending, approved, rejected, back to pending on edit", async () => {
    const ctx = await setup();
    const free = await saved(ctx, { materials: [] });
    expect(free.approvalStatus).toBe("not_required");
    const notPending = await approve(
      post(`${BASE}/${free.id}/approve`, {}),
      params(free.id),
    );
    expect(notPending.status).toBe(StatusCodes.CONFLICT);
    expect(await code(notPending)).toBe("WORKSHEET_NOT_PENDING");

    await setApproval(ctx, true);
    // Turning approval on does not change saved sheets.
    expect(
      (
        await json<Sheet>(
          await getOne(get(`${BASE}/${free.id}`), params(free.id)),
        )
      ).approvalStatus,
    ).toBe("not_required");

    const pending = await saved(ctx, { materials: [] });
    expect(pending.approvalStatus).toBe("pending");
    expect(pending.actions).toMatchObject({ approve: true, reject: true });

    const noReason = await reject(
      post(`${BASE}/${pending.id}/reject`, { reason: "  " }),
      params(pending.id),
    );
    expect(noReason.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await code(noReason)).toBe("REJECTION_REASON_REQUIRED");

    const rejected = await reject(
      post(`${BASE}/${pending.id}/reject`, { reason: "Wrong floor" }),
      params(pending.id),
    );
    expect(rejected.status).toBe(StatusCodes.OK);
    const rejectedSheet = await json<Sheet>(rejected);
    expect(rejectedSheet).toMatchObject({
      approvalStatus: "rejected",
      rejectionReason: "Wrong floor",
    });

    const resubmitted = await edit(ctx, rejectedSheet, {
      materials: [],
      remark: "Fixed",
    });
    const back = await json<Sheet>(resubmitted);
    expect(back).toMatchObject({
      approvalStatus: "pending",
      rejectionReason: null,
    });

    const approved = await approve(
      post(`${BASE}/${back.id}/approve`, { expectedUpdatedAt: back.updatedAt }),
      params(back.id),
    );
    const approvedSheet = await json<Sheet>(approved);
    expect(approvedSheet.approvalStatus).toBe("approved");

    const editedApproved = await edit(ctx, approvedSheet, {
      materials: [],
      skilledCount: 9,
    });
    expect((await json<Sheet>(editedApproved)).approvalStatus).toBe("pending");

    const direct = await saved(ctx, { materials: [], approve: true });
    expect(direct.approvalStatus).toBe("approved");
  });

  it("needs Approve for Save & Approve and Create to save", async () => {
    const ctx = await setup();
    await setApproval(ctx, true);
    actAs(await member(ctx, ["read"]));
    const noCreate = await save(ctx, { materials: [] });
    expect(noCreate.status).toBe(StatusCodes.FORBIDDEN);
    const listed = await list(get(`${BASE}?projectId=${ctx.projectId}`));
    expect(listed.status).toBe(StatusCodes.OK);

    actAs(await member(ctx, ["read", "create"]));
    const noApprove = await save(ctx, { materials: [], approve: true });
    expect(noApprove.status).toBe(StatusCodes.FORBIDDEN);
    const ok = await saved(ctx, { materials: [] });
    expect(ok.actions).toMatchObject({
      edit: false,
      approve: false,
      delete: false,
    });

    actAs(await member(ctx, ["read", "create"], false));
    const offProject = await save(ctx, { materials: [] });
    expect(offProject.status).toBe(StatusCodes.FORBIDDEN);
  });

  it("raises document.submitted, approved and rejected for notifications (CM-904)", async () => {
    const ctx = await setup();
    await setApproval(ctx, true);
    const clerk = await member(ctx, ["read", "create", "update"]);
    actAs(clerk);
    const spy = vi.spyOn(InProcessEventDispatcher.prototype, "dispatch");
    const sheet = await saved(ctx, { materials: [] });
    expect(dispatched(spy, "document.submitted")).toEqual([
      expect.objectContaining({
        documentType: "worksheet",
        documentId: sheet.id,
        projectId: ctx.projectId,
        number: sheet.number,
        submittedBy: clerk.userId,
      }),
    ]);

    actAs(ctx.owner);
    const rejected = await json<Sheet>(
      await reject(
        post(`${BASE}/${sheet.id}/reject`, { reason: " Wrong floor " }),
        params(sheet.id),
      ),
    );
    expect(dispatched(spy, "document.rejected")).toEqual([
      expect.objectContaining({
        documentType: "worksheet",
        documentId: sheet.id,
        number: sheet.number,
        rejectedBy: ctx.by,
        createdBy: clerk.userId,
        reason: "Wrong floor",
      }),
    ]);

    actAs(clerk);
    const back = await json<Sheet>(
      await edit(ctx, rejected, { materials: [], remark: "Fixed" }),
    );
    expect(back.approvalStatus).toBe("pending");
    expect(dispatched(spy, "document.submitted")).toHaveLength(2);

    actAs(ctx.owner);
    await bulkApprove(
      post(`${BASE}/bulk-approve`, {
        projectId: ctx.projectId,
        ids: [sheet.id],
      }),
    );
    expect(dispatched(spy, "document.approved")).toEqual([
      expect.objectContaining({
        documentType: "worksheet",
        documentId: sheet.id,
        number: sheet.number,
        approvedBy: ctx.by,
        createdBy: clerk.userId,
      }),
    ]);

    // Save & Approve is approved at once: nobody waits for it.
    const direct = await saved(ctx, { materials: [], approve: true });
    expect(dispatched(spy, "document.submitted")).toHaveLength(2);
    expect(dispatched(spy, "document.approved").at(-1)).toMatchObject({
      documentId: direct.id,
      createdBy: ctx.by,
    });
  });

  it("decides in bulk, all or none", async () => {
    const ctx = await setup();
    await setApproval(ctx, true);
    const first = await saved(ctx, { materials: [] });
    const second = await saved(ctx, { materials: [], shift: "shift_2" });
    const done = await saved(ctx, { materials: [], approve: true });

    const refused = await bulkApprove(
      post(`${BASE}/bulk-approve`, {
        projectId: ctx.projectId,
        ids: [first.id, second.id, done.id],
      }),
    );
    expect(refused.status).toBe(StatusCodes.CONFLICT);
    const error = await json<{
      code: string;
      details: { refusals: { id: string; code: string }[] };
    }>(refused);
    expect(error.code).toBe("BULK_DECISION_REFUSED");
    expect(error.details.refusals).toEqual([
      expect.objectContaining({ id: done.id, code: "WORKSHEET_NOT_PENDING" }),
    ]);
    expect(
      await prisma.constructionSiteWorkWorksheet.count({
        where: { id: { in: [first.id, second.id] }, approvalStatus: "pending" },
      }),
    ).toBe(2);

    const noReason = await bulkReject(
      post(`${BASE}/bulk-reject`, {
        projectId: ctx.projectId,
        ids: [first.id],
        reason: "",
      }),
    );
    expect(noReason.status).toBe(StatusCodes.BAD_REQUEST);

    const rejected = await bulkReject(
      post(`${BASE}/bulk-reject`, {
        projectId: ctx.projectId,
        ids: [first.id],
        reason: "Counts do not match attendance",
      }),
    );
    expect(await json(rejected)).toEqual({ decided: 1 });
    const approved = await bulkApprove(
      post(`${BASE}/bulk-approve`, {
        projectId: ctx.projectId,
        ids: [second.id],
      }),
    );
    expect(await json(approved)).toEqual({ decided: 1 });

    const filtered = await json<{ total: number; items: Sheet[] }>(
      await list(
        get(`${BASE}?projectId=${ctx.projectId}&approvalStatus=approved`),
      ),
    );
    expect(filtered.items.map((item) => item.id).sort()).toEqual(
      [second.id, done.id].sort(),
    );
  });

  it("prefills from labour and vendor attendance, less other worksheets", async () => {
    const ctx = await setup();
    const mason = await worksheetLabourCategory(ctx.ws, ctx.by, "skilled");
    const helper = await worksheetLabourCategory(ctx.ws, ctx.by, "unskilled");
    const date = addDays(TODAY, -1);
    const mark = (
      categoryId: string | null,
      status: "present" | "half_day" | "absent",
      deleted = false,
    ) =>
      worksheetLabourAttendance(ctx.ws, ctx.by, ctx.projectId, date, {
        categoryId,
        status,
        deleted,
      });
    await mark(mason, "present");
    await mark(mason, "half_day");
    await mark(mason, "absent");
    await mark(mason, "present", true);
    await mark(helper, "present");
    await mark(null, "present");
    await worksheetVendorAttendance(ctx.ws, ctx.by, ctx.projectId, date, [
      { categoryId: mason, fullDay: 3, halfDay: 1 },
      { categoryId: helper, fullDay: 2, halfDay: 0 },
    ]);
    // Another Project's attendance does not count.
    const villa = await addProject(ctx.ws, ctx.by, "Villa Phase 2");
    await worksheetLabourAttendance(ctx.ws, ctx.by, villa, date, {
      categoryId: mason,
      status: "present",
    });

    const read = async (exclude?: string) =>
      json<{
        attendance: { skilled: number; unskilled: number };
        onWorksheets: { skilled: number; unskilled: number };
        remaining: { skilled: number; unskilled: number };
      }>(
        await attendance(
          get(
            `${BASE}/attendance?projectId=${ctx.projectId}&date=${date}${exclude == null ? "" : `&excludeWorksheetId=${exclude}`}`,
          ),
        ),
      );
    expect(await read()).toEqual({
      date,
      attendance: { skilled: 6, unskilled: 4 },
      onWorksheets: { skilled: 0, unskilled: 0 },
      remaining: { skilled: 6, unskilled: 4 },
    });

    const sheet = await saved(ctx, {
      sheetDate: date,
      skilledCount: 2,
      unskilledCount: 5,
      materials: [],
    });
    expect(await read()).toMatchObject({
      onWorksheets: { skilled: 2, unskilled: 5 },
      remaining: { skilled: 4, unskilled: 0 },
    });
    expect(await read(sheet.id)).toMatchObject({
      onWorksheets: { skilled: 0, unskilled: 0 },
    });
  });

  it("offers the Project's Contractors, their Departments and Work Types", async () => {
    const ctx = await setup();
    await worksheetContractor(ctx.ws, ctx.by, {
      departmentIds: [ctx.department],
    });
    const response = await formOptions(
      get(`${BASE}/form-options?projectId=${ctx.projectId}`),
    );
    expect(response.status).toBe(StatusCodes.OK);
    const options = await json<{
      settings: { approvalEnabled: boolean };
      contractors: { id: string; departmentIds: string[] }[];
      departments: { id: string; name: string }[];
      workTypes: { id: string; departmentId: string; materialIds: string[] }[];
      units: { id: string; name: string }[];
    }>(response);
    expect(options.settings.approvalEnabled).toBe(false);
    expect(options.contractors).toEqual([
      {
        id: ctx.contractor,
        name: "Velan Constructions",
        departmentIds: [ctx.department],
      },
    ]);
    expect(options.departments).toEqual([
      { id: ctx.department, name: "Masonry Crew" },
    ]);
    expect(options.workTypes).toEqual([
      {
        id: ctx.workType,
        name: "Brickwork",
        departmentId: ctx.department,
        materialIds: [ctx.cement.id],
      },
    ]);
    expect(options.units.some((unit) => unit.id === ctx.unit)).toBe(true);
  });

  it("keeps a floor a worksheet names from being removed (409 FLOOR_IN_USE)", async () => {
    const ctx = await setup();
    const config = {
      floors: 2,
      startNumber: 1,
      unitsPerFloor: 2,
      basements: 0,
    };
    const floors = generateWingFloors(
      "commercial",
      wingConfig("commercial", config),
    ).map((floor) => ({
      kind: floor.kind,
      name: floor.name,
      units: floor.units.map((name) => ({ name })),
    }));
    const wingsUrl = `${ORIGIN}/api/construction/projects/projects/${ctx.projectId}/wings`;
    const created = await createWing(
      post(wingsUrl, { type: "commercial", name: "Wing A", config, floors }),
      params(ctx.projectId),
    );
    expect(created.status).toBe(StatusCodes.CREATED);
    const wing = await json<{
      id: string;
      updatedAt: string;
      name: string;
      floors: {
        id: string;
        kind: string;
        name: string;
        units: { id: string; name: string }[];
      }[];
    }>(created);
    const floor = wing.floors[0];
    if (floor == null) throw new Error("No floor");
    await saved(ctx, {
      siteLocation: { type: "wing", wingId: wing.id, floorIds: [floor.id] },
      materials: [],
    });
    const response = await updateWing(
      post(`${wingsUrl}/${wing.id}/update`, {
        name: wing.name,
        expectedUpdatedAt: wing.updatedAt,
        floors: wing.floors.slice(1).map((row) => ({
          id: row.id,
          kind: row.kind,
          name: row.name,
          units: row.units.map((unit) => ({ id: unit.id, name: unit.name })),
        })),
      }),
      { params: Promise.resolve({ id: ctx.projectId, wingId: wing.id }) },
    );
    expect(response.status).toBe(StatusCodes.CONFLICT);
    expect(await code(response)).toBe("FLOOR_IN_USE");
  });

  it("is on /api/docs", async () => {
    const document = await json<{ paths: Record<string, unknown> }>(
      getOpenApi(),
    );
    for (const path of [
      "/api/construction/site-work/worksheets",
      "/api/construction/site-work/worksheets/{id}",
      "/api/construction/site-work/worksheets/{id}/update",
      "/api/construction/site-work/worksheets/{id}/approve",
      "/api/construction/site-work/worksheets/bulk-reject",
      "/api/construction/site-work/worksheets/form-options",
      "/api/construction/site-work/worksheets/attendance",
      "/api/construction/site-work/worksheets/available-stock",
      "/api/construction/site-work/settings/worksheets",
    ])
      expect(document.paths[path], path).toBeDefined();
  });
});
