import { randomUUID } from "node:crypto";

import { prisma } from "@repo/construction-db";

import { POST as addEquipmentRoute } from "@/app/api/construction/site-work/equipment/route";
import { POST as maintenanceRoute } from "@/app/api/construction/site-work/equipment/[id]/maintenance/route";
import { POST as transferRoute } from "@/app/api/construction/site-work/equipment/[id]/transfer/route";
import {
  calendarDateToDb,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";

import type { SiteWorkDocumentType } from "@/src/site-work/domain/site-work-documents";

import { actAs } from "./companies";

/**
 * HTTP-test helpers for site work (M6). Each area prefixes its own helpers
 * (`shared…` for the document thread, `worksheet…`, `equipment…` …) so
 * parallel tickets never clash here.
 */

// ---------------------------------------------------------------------------
// Shared: minimal live document rows for the document thread (CM-0016 §8).
// Only the columns each table requires; the documents' own routes are
// other tickets'.
// ---------------------------------------------------------------------------

const SHARED_DAY = new Date("2026-10-08T00:00:00.000Z");

let sharedSequence = 0;

function sharedNumber(prefix: string): string {
  sharedSequence += 1;
  return `${prefix}/${randomUUID().slice(0, 6)}/${String(sharedSequence)}`;
}

const sharedAudit = (by: string) => ({ createdBy: by, updatedBy: by });

export type SharedDocumentRow = { id: string; label: string };

/** A live Daily Worksheet on the Project. */
export async function sharedAddWorksheetRow(
  workspaceId: string,
  by: string,
  projectId: string,
): Promise<SharedDocumentRow> {
  const id = randomUUID();
  const number = sharedNumber("WS");
  await prisma.constructionSiteWorkWorksheet.create({
    data: {
      id,
      workspaceId,
      projectId,
      number,
      sheetDate: SHARED_DAY,
      shift: "shift_1",
      contractorId: randomUUID(),
      departmentId: randomUUID(),
      ...sharedAudit(by),
    },
  });
  return { id, label: number };
}

/** A live Equipment Usage sheet on the Project, with its own equipment. */
export async function sharedAddEquipmentUsageRow(
  workspaceId: string,
  by: string,
  projectId: string,
): Promise<SharedDocumentRow> {
  const equipmentId = randomUUID();
  await prisma.constructionSiteWorkEquipment.create({
    data: {
      id: equipmentId,
      workspaceId,
      name: "JCB 3DX",
      equipmentNumber: `TN-${randomUUID().slice(0, 8)}`,
      ownership: "owned",
      utilisationBasis: "hourly",
      workingTimeMethod: "time_shifts",
      currentProjectId: projectId,
      ...sharedAudit(by),
    },
  });
  const id = randomUUID();
  const number = sharedNumber("EU");
  await prisma.constructionSiteWorkEquipmentUsageSheet.create({
    data: {
      id,
      workspaceId,
      projectId,
      number,
      sheetDate: SHARED_DAY,
      shift: "shift_1",
      equipmentId,
      ownership: "owned",
      utilisationBasis: "hourly",
      workingTimeMethod: "time_shifts",
      ...sharedAudit(by),
    },
  });
  return { id, label: number };
}

/** A live Site Diary on the Project for `date` (one per Project per date). */
export async function sharedAddSiteDiaryRow(
  workspaceId: string,
  by: string,
  projectId: string,
  date = "2026-10-08",
): Promise<SharedDocumentRow> {
  const id = randomUUID();
  await prisma.constructionSiteWorkSiteDiary.create({
    data: {
      id,
      workspaceId,
      projectId,
      diaryDate: new Date(`${date}T00:00:00.000Z`),
      ...sharedAudit(by),
    },
  });
  return { id, label: date };
}

/** A live Hindrance on the Project. */
export async function sharedAddHindranceRow(
  workspaceId: string,
  by: string,
  projectId: string,
): Promise<SharedDocumentRow> {
  const id = randomUUID();
  const number = sharedNumber("HR");
  await prisma.constructionSiteWorkHindrance.create({
    data: {
      id,
      workspaceId,
      projectId,
      number,
      startDate: SHARED_DAY,
      cause: "weather",
      affectedActivity: "Slab casting, 3rd floor",
      responsibleParty: "force_majeure",
      ...sharedAudit(by),
    },
  });
  return { id, label: number };
}

/** A live document of `type` on the Project. */
export function sharedAddDocumentRow(
  type: SiteWorkDocumentType,
  workspaceId: string,
  by: string,
  projectId: string,
): Promise<SharedDocumentRow> {
  switch (type) {
    case "worksheet":
      return sharedAddWorksheetRow(workspaceId, by, projectId);
    case "equipment_usage":
      return sharedAddEquipmentUsageRow(workspaceId, by, projectId);
    case "site_diary":
      return sharedAddSiteDiaryRow(workspaceId, by, projectId);
    case "hindrance":
      return sharedAddHindranceRow(workspaceId, by, projectId);
  }
}

/** Tombstones a document as its own delete would. */
export async function sharedDeleteDocumentRow(
  type: SiteWorkDocumentType,
  id: string,
): Promise<void> {
  const data = { deletedAt: new Date(), deletedBy: "test" };
  const where = { id };
  switch (type) {
    case "worksheet":
      await prisma.constructionSiteWorkWorksheet.update({ where, data });
      return;
    case "equipment_usage":
      await prisma.constructionSiteWorkEquipmentUsageSheet.update({
        where,
        data,
      });
      return;
    case "site_diary":
      await prisma.constructionSiteWorkSiteDiary.update({ where, data });
      return;
    case "hindrance":
      await prisma.constructionSiteWorkHindrance.update({ where, data });
      return;
  }
}

/** Puts a Team Member on Projects (`memberWith` assigns none). */
export async function sharedAssign(
  memberId: string,
  ...projectIds: string[]
): Promise<void> {
  await prisma.constructionOrganizationTeamMemberProject.createMany({
    data: projectIds.map((projectId) => ({ memberId, projectId })),
  });
}

// ---------------------------------------------------------------------------
// Worksheets (CM-602): masters and attendance rows for the worksheet tests.
// ---------------------------------------------------------------------------

function audit(by: string) {
  const now = new Date();
  return { createdAt: now, updatedAt: now, createdBy: by, updatedBy: by };
}

const day = (date: string) => new Date(`${date}T00:00:00.000Z`);

/** A Department (trade) of the Company. */
export async function worksheetDepartment(
  workspaceId: string,
  by: string,
  options: { name?: string; disabled?: boolean } = {},
): Promise<string> {
  const id = randomUUID();
  await prisma.constructionMastersDepartment.create({
    data: {
      id,
      workspaceId,
      name: options.name ?? `Masonry ${randomUUID().slice(0, 6)}`,
      disabledAt: options.disabled === true ? new Date() : null,
      ...audit(by),
    },
  });
  return id;
}

/** A Contractor on these Projects, working in these Departments. */
export async function worksheetContractor(
  workspaceId: string,
  by: string,
  options: {
    projectIds?: readonly string[];
    departmentIds?: readonly string[];
    name?: string;
  } = {},
): Promise<string> {
  const id = randomUUID();
  await prisma.constructionMastersContractor.create({
    data: {
      id,
      workspaceId,
      name: options.name ?? `Velan Constructions ${randomUUID().slice(0, 6)}`,
      ...audit(by),
      projects: {
        create: (options.projectIds ?? []).map((projectId) => ({ projectId })),
      },
      departments: {
        create: (options.departmentIds ?? []).map((departmentId) => ({
          departmentId,
        })),
      },
    },
  });
  return id;
}

/** A Work Type of a Department with assigned Materials. */
export async function worksheetWorkType(
  workspaceId: string,
  by: string,
  departmentId: string,
  materialIds: readonly string[] = [],
  name = `Brickwork ${randomUUID().slice(0, 6)}`,
): Promise<string> {
  const id = randomUUID();
  await prisma.constructionMastersWorkType.create({
    data: {
      id,
      workspaceId,
      name,
      departmentId,
      ...audit(by),
      materials: { create: materialIds.map((materialId) => ({ materialId })) },
    },
  });
  return id;
}

/** A Location of a non-building Project (CM-405). */
export async function worksheetLocation(
  workspaceId: string,
  by: string,
  projectId: string,
  name = `Pump house ${randomUUID().slice(0, 6)}`,
): Promise<string> {
  const id = randomUUID();
  await prisma.constructionProjectsLocation.create({
    data: { id, workspaceId, projectId, name, position: 0, ...audit(by) },
  });
  return id;
}

/** A Labour Category with a skill (CM-0016 §6). */
export async function worksheetLabourCategory(
  workspaceId: string,
  by: string,
  skill: "skilled" | "unskilled",
): Promise<string> {
  const id = randomUUID();
  await prisma.constructionMastersLabourCategory.create({
    data: {
      id,
      workspaceId,
      name: `${skill} ${randomUUID().slice(0, 6)}`,
      skill,
      ...audit(by),
    },
  });
  return id;
}

/**
 * A labourer on the Project and their attendance on `date` (one live
 * row), optionally deleted.
 */
export async function worksheetLabourAttendance(
  workspaceId: string,
  by: string,
  projectId: string,
  date: string,
  options: {
    categoryId: string | null;
    status: "present" | "half_day" | "absent" | "on_leave" | "holiday";
    deleted?: boolean;
  },
): Promise<void> {
  const labourId = randomUUID();
  await prisma.constructionLabourLabour.create({
    data: {
      id: labourId,
      workspaceId,
      name: `Murugan ${randomUUID().slice(0, 6)}`,
      joiningDate: day("2026-04-01"),
      wageType: "daily",
      wagePerDay: 80_000,
      overtimeWagePerHour: 10_000,
      weeklyHolidays: [0],
      labourCategoryId: options.categoryId,
      currentProjectId: projectId,
      ...audit(by),
    },
  });
  await prisma.constructionLabourAttendance.create({
    data: {
      id: randomUUID(),
      workspaceId,
      projectId,
      labourId,
      attendanceDate: day(date),
      status: options.status,
      wageType: "daily",
      wageRate: 80_000,
      earned: options.status === "present" ? 80_000 : 0,
      ...audit(by),
      deletedAt: options.deleted === true ? new Date() : null,
      deletedBy: options.deleted === true ? by : null,
    },
  });
}

/** A vendor's attendance at the Project on `date`, a line per category. */
export async function worksheetVendorAttendance(
  workspaceId: string,
  by: string,
  projectId: string,
  date: string,
  lines: readonly {
    categoryId: string;
    fullDay: number;
    halfDay: number;
  }[],
): Promise<void> {
  const vendorId = randomUUID();
  const shiftId = randomUUID();
  await prisma.constructionLabourVendor.create({
    data: {
      id: vendorId,
      workspaceId,
      name: `Sri Ganesh Labour Supply ${randomUUID().slice(0, 6)}`,
      joiningDate: day("2026-04-01"),
      ...audit(by),
      projects: { create: [{ projectId }] },
      shifts: { create: [{ id: shiftId, name: "Shift 1", sortOrder: 0 }] },
    },
  });
  await prisma.constructionLabourVendorAttendance.create({
    data: {
      id: randomUUID(),
      workspaceId,
      projectId,
      vendorId,
      attendanceDate: day(date),
      totalPay: 0,
      ...audit(by),
      lines: {
        create: lines.map((line) => ({
          id: randomUUID(),
          shiftId,
          shiftName: "Shift 1",
          labourCategoryId: line.categoryId,
          fullDayCount: line.fullDay,
          halfDayCount: line.halfDay,
          ratePerDay: 0,
          overtimePerHour: 0,
          amount: 0,
        })),
      },
    },
  });
}

// Site-work test helpers (M6). Each area prefixes its own, so parallel
// tickets do not clash: `equipment…` (CM-603, CM-605), …

export const EQUIPMENT_API =
  "http://localhost/api/construction/site-work/equipment";

/** Who a helper acts as: `actAs` is set to this before the route runs. */
export type EquipmentActor = {
  userId: string;
  workspaceId: string;
  role?: "owner" | "member";
};

/** The equipment as the routes answer it (the fields tests read). */
export type EquipmentJson = {
  id: string;
  name: string;
  equipmentNumber: string;
  ownership: "owned" | "rented";
  utilisationBasis: "hourly" | "km" | "trip";
  workingTimeMethod: "time_shifts" | "meter_reading" | "both";
  hireParty: { id: string; name: string | null } | null;
  hireBasis: string | null;
  hireRate: number | null;
  idleChargeable: boolean;
  currentProject: { id: string; name: string | null } | null;
  currentLocationName: string | null;
  state: "available" | "in_maintenance" | "unavailable";
  availableForEntry: boolean;
  unavailableSince: string | null;
  openMaintenance: { id: string; kind: string; startDate: string } | null;
  photo: { url: string; thumbnailUrl: string } | null;
  updatedAt: string;
  movements?: {
    id: string;
    kind: string;
    movementDate: string;
    before: {
      project: { id: string; name: string | null } | null;
      locationName: string | null;
    } | null;
    toProject: { id: string; name: string | null } | null;
    locationName: string;
    remark: string | null;
    createdBy: { userId: string; name: string | null };
  }[];
  maintenance?: {
    id: string;
    kind: string;
    startDate: string;
    endDate: string | null;
    cost: number | null;
    workshop: string | null;
    remark: string | null;
  }[];
  actions?: Record<string, boolean>;
};

const params = (id: string) => ({ params: Promise.resolve({ id }) });

function post(path: string, body: unknown): Request {
  return new Request(`${EQUIPMENT_API}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function ok<T>(response: Response, what: string): Promise<T> {
  if (!response.ok)
    throw new Error(
      `${what} failed: ${String(response.status)} ${await response.text()}`,
    );
  return (await response.json()) as T;
}

/** An owned, hourly, time-shift machine with a fresh number. */
export function equipmentOwnedInput(
  patch: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    ownership: "owned",
    name: "JCB 3DX",
    equipmentNumber: `TN-${randomUUID().slice(0, 8)}`,
    purchaseYear: 2020,
    fuelType: "diesel",
    fuelUnit: "litre",
    utilisationBasis: "hourly",
    workingTimeMethod: "both",
    targetValue: "8",
    targetUnit: "hours_per_day",
    expectedFuelEfficiency: "6.5",
    projectId: null,
    ...patch,
  };
}

/** A rented, hourly machine hired from `hirePartyId` at ₹1,200 an hour. */
export function equipmentRentedInput(
  hirePartyId: string,
  patch: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    ownership: "rented",
    name: "Hired excavator",
    equipmentNumber: `RT-${randomUUID().slice(0, 8)}`,
    fuelType: "diesel",
    fuelUnit: "litre",
    utilisationBasis: "hourly",
    workingTimeMethod: "meter_reading",
    hirePartyId,
    hireBasis: "hourly",
    hireRate: 120_000,
    idleChargeable: true,
    projectId: null,
    ...patch,
  };
}

/**
 * Adds equipment through `POST /equipment` as `actor` (an owned machine at
 * the warehouse unless `input` says otherwise). Leaves `actAs` on `actor`.
 */
export async function equipmentAdd(
  actor: EquipmentActor,
  input: Record<string, unknown> = equipmentOwnedInput(),
): Promise<EquipmentJson> {
  actAs({ role: "owner", ...actor });
  return ok<EquipmentJson>(
    await addEquipmentRoute(post("", input)),
    "equipmentAdd",
  );
}

/** Transfers through the route as `actor`; answers the equipment. */
export async function equipmentTransfer(
  actor: EquipmentActor,
  equipment: { id: string; updatedAt: string },
  input: {
    kind?: "to_project" | "to_warehouse";
    toProjectId?: string | null;
    movementDate: CalendarDate;
    locationName?: string;
    remark?: string | null;
  },
): Promise<EquipmentJson> {
  actAs({ role: "owner", ...actor });
  return ok<EquipmentJson>(
    await transferRoute(
      post(`/${equipment.id}/transfer`, {
        expectedUpdatedAt: equipment.updatedAt,
        kind: input.kind ?? "to_project",
        toProjectId: input.toProjectId ?? null,
        movementDate: input.movementDate,
        locationName: input.locationName ?? "Site yard",
        remark: input.remark ?? null,
      }),
      params(equipment.id),
    ),
    "equipmentTransfer",
  );
}

/** Logs Maintenance through the route as `actor`; answers the equipment. */
export async function equipmentLogMaintenance(
  actor: EquipmentActor,
  equipment: { id: string; updatedAt: string },
  input: { startDate: CalendarDate; kind?: string; cost?: number | null },
): Promise<EquipmentJson> {
  actAs({ role: "owner", ...actor });
  return ok<EquipmentJson>(
    await maintenanceRoute(
      post(`/${equipment.id}/maintenance`, {
        expectedUpdatedAt: equipment.updatedAt,
        kind: input.kind ?? "breakdown",
        startDate: input.startDate,
        workshop: "Sri Balaji Motors",
        ...(input.cost === undefined ? {} : { cost: input.cost }),
      }),
      params(equipment.id),
    ),
    "equipmentLogMaintenance",
  );
}

/**
 * A live Equipment Usage sheet row written straight to
 * `construction_site_work.equipment_usage_sheets`, for tests that need one
 * before CM-604's routes (or without them). Answers its id.
 */
export async function equipmentSheetRow(
  workspaceId: string,
  by: string,
  input: {
    equipmentId: string;
    projectId: string;
    sheetDate: CalendarDate;
    shift?: "shift_1" | "shift_2" | "shift_3";
    ownership?: "owned" | "rented";
    openingReading?: string | null;
    closingReading?: string | null;
  },
): Promise<string> {
  const id = randomUUID();
  const now = new Date();
  await prisma.constructionSiteWorkEquipmentUsageSheet.create({
    data: {
      id,
      workspaceId,
      projectId: input.projectId,
      number: `EU/TEST/${id.slice(0, 8)}`,
      sheetDate: calendarDateToDb(input.sheetDate),
      shift: input.shift ?? "shift_1",
      equipmentId: input.equipmentId,
      ownership: input.ownership ?? "owned",
      utilisationBasis: "hourly",
      workingTimeMethod: "meter_reading",
      openingReading: input.openingReading ?? null,
      closingReading: input.closingReading ?? null,
      createdAt: now,
      updatedAt: now,
      createdBy: by,
      updatedBy: by,
    },
  });
  return id;
}
