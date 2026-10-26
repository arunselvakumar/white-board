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

/** Masters a row names; random ids when left out. */
export type SharedRefs = {
  contractorId?: string;
  departmentId?: string;
  workTypeId?: string;
  /** Material lines (worksheet and usage sheet). */
  materialIds?: readonly string[];
};

function sharedLines(materialIds: readonly string[] = []) {
  return materialIds.map((materialId, index) => ({
    id: randomUUID(),
    materialId,
    materialName: "Cement OPC 53",
    unitName: "Bag",
    quantity: "1",
    sortOrder: index,
  }));
}

/** A live Daily Worksheet on the Project. */
export async function sharedAddWorksheetRow(
  workspaceId: string,
  by: string,
  projectId: string,
  refs: SharedRefs = {},
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
      contractorId: refs.contractorId ?? randomUUID(),
      departmentId: refs.departmentId ?? randomUUID(),
      workTypeId: refs.workTypeId ?? null,
      ...sharedAudit(by),
      materials: { create: sharedLines(refs.materialIds) },
    },
  });
  return { id, label: number };
}

/**
 * Live owned equipment at the Project, or rented from `hirePartyId` (a
 * Contractor) when given.
 */
export async function sharedAddEquipmentRow(
  workspaceId: string,
  by: string,
  projectId: string,
  hirePartyId?: string,
): Promise<string> {
  const equipmentId = randomUUID();
  await prisma.constructionSiteWorkEquipment.create({
    data: {
      id: equipmentId,
      workspaceId,
      name: "JCB 3DX",
      equipmentNumber: `TN-${randomUUID().slice(0, 8)}`,
      ownership: hirePartyId == null ? "owned" : "rented",
      utilisationBasis: "hourly",
      workingTimeMethod: "time_shifts",
      currentProjectId: projectId,
      ...(hirePartyId == null
        ? {}
        : { hirePartyId, hireBasis: "hourly" as const, hireRate: 120_000n }),
      ...sharedAudit(by),
    },
  });
  return equipmentId;
}

/** A live Equipment Usage sheet on the Project, with its own equipment. */
export async function sharedAddEquipmentUsageRow(
  workspaceId: string,
  by: string,
  projectId: string,
  refs: SharedRefs = {},
): Promise<SharedDocumentRow> {
  const equipmentId = await sharedAddEquipmentRow(workspaceId, by, projectId);
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
      contractorId: refs.contractorId ?? null,
      departmentId: refs.departmentId ?? null,
      ...sharedAudit(by),
      materials: { create: sharedLines(refs.materialIds) },
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

/** A live Hindrance on the Project (the Contractor's when given). */
export async function sharedAddHindranceRow(
  workspaceId: string,
  by: string,
  projectId: string,
  refs: Pick<SharedRefs, "contractorId"> = {},
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
      ...(refs.contractorId == null
        ? { responsibleParty: "force_majeure" as const }
        : {
            responsibleParty: "contractor" as const,
            contractorId: refs.contractorId,
          }),
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
      projects: {
        create: { workspaceId, projectId, since: day("2026-04-01") },
      },
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

// ---------------------------------------------------------------------------
// Reports and dashboard (CM-605, CM-608): rows written straight to the
// site-work tables with the figures the reports read.
// ---------------------------------------------------------------------------

function reportsAudit(by: string) {
  const now = new Date();
  return { createdAt: now, updatedAt: now, createdBy: by, updatedBy: by };
}

/** A live Daily Worksheet with labour counts, materials and photo rows. */
export async function reportsWorksheet(
  workspaceId: string,
  by: string,
  input: {
    projectId: string;
    sheetDate: CalendarDate;
    contractorId: string;
    departmentId: string;
    skilled?: number | null;
    unskilled?: number | null;
    shift?: "shift_1" | "shift_2" | "shift_3";
    approval?: "not_required" | "pending" | "approved" | "rejected";
    location?: { type: "location"; locationId: string } | null;
    approxWorkQty?: string | null;
    approxWorkUnitId?: string | null;
    materials?: readonly { name: string; unit: string; quantity: string }[];
    photos?: number;
    remark?: string | null;
    deleted?: boolean;
  },
): Promise<{ id: string; number: string }> {
  const id = randomUUID();
  const number = `WS/${id.slice(0, 8)}`;
  await prisma.constructionSiteWorkWorksheet.create({
    data: {
      id,
      workspaceId,
      projectId: input.projectId,
      number,
      sheetDate: calendarDateToDb(input.sheetDate),
      shift: input.shift ?? "shift_1",
      contractorId: input.contractorId,
      departmentId: input.departmentId,
      skilledCount: input.skilled ?? null,
      unskilledCount: input.unskilled ?? null,
      approvalStatus: input.approval ?? "not_required",
      rejectionReason: input.approval === "rejected" ? "Counts wrong" : null,
      siteLocationType: input.location?.type ?? null,
      siteLocation: input.location == null ? undefined : { ...input.location },
      approxWorkQty: input.approxWorkQty ?? null,
      approxWorkUnitId: input.approxWorkUnitId ?? null,
      remark: input.remark ?? null,
      ...reportsAudit(by),
      deletedAt: input.deleted === true ? new Date() : null,
      deletedBy: input.deleted === true ? by : null,
      materials: {
        create: (input.materials ?? []).map((line, index) => ({
          id: randomUUID(),
          materialId: randomUUID(),
          materialName: line.name,
          unitName: line.unit,
          quantity: line.quantity,
          sortOrder: index,
        })),
      },
    },
  });
  for (let index = 0; index < (input.photos ?? 0); index += 1)
    await prisma.constructionSiteWorkDocumentFile.create({
      data: {
        id: randomUUID(),
        workspaceId,
        documentType: "worksheet",
        documentId: id,
        fileKey: `test/${randomUUID()}.png`,
        fileName: `photo-${String(index + 1)}.png`,
        contentType: "image/png",
        bytes: 64,
        createdBy: by,
      },
    });
  return { id, number };
}

/**
 * Equipment and its first movement (`added` at a Project or the
 * warehouse on `placedOn`).
 */
export async function reportsEquipment(
  workspaceId: string,
  by: string,
  input: {
    name: string;
    projectId: string | null;
    placedOn: CalendarDate;
    ownership?: "owned" | "rented";
    utilisationBasis?: "hourly" | "km" | "trip";
    purchaseYear?: number | null;
    hirePartyId?: string | null;
    hireBasis?: "hourly" | "daily" | "monthly" | "trip" | null;
    hireRate?: bigint | null;
  },
): Promise<{ id: string; equipmentNumber: string }> {
  const id = randomUUID();
  const equipmentNumber = `TN-${id.slice(0, 8)}`;
  await prisma.constructionSiteWorkEquipment.create({
    data: {
      id,
      workspaceId,
      name: input.name,
      equipmentNumber,
      ownership: input.ownership ?? "owned",
      purchaseYear: input.purchaseYear ?? null,
      fuelType: "diesel",
      fuelUnit: "litre",
      utilisationBasis: input.utilisationBasis ?? "hourly",
      workingTimeMethod: "time_shifts",
      hirePartyId: input.hirePartyId ?? null,
      hireBasis: input.hireBasis ?? null,
      hireRate: input.hireRate ?? null,
      currentProjectId: input.projectId,
      ...reportsAudit(by),
    },
  });
  await reportsMovement(workspaceId, by, {
    equipmentId: id,
    kind: "added",
    movementDate: input.placedOn,
    fromProjectId: null,
    toProjectId: input.projectId,
    locationName: input.projectId == null ? "Warehouse / off system" : "Site",
  });
  return { id, equipmentNumber };
}

/** A movement row; `createdAt` follows the call order. */
export async function reportsMovement(
  workspaceId: string,
  by: string,
  input: {
    equipmentId: string;
    kind: "added" | "to_project" | "to_warehouse";
    movementDate: CalendarDate;
    fromProjectId: string | null;
    toProjectId: string | null;
    locationName: string;
    remark?: string | null;
  },
): Promise<void> {
  await prisma.constructionSiteWorkEquipmentMovement.create({
    data: {
      id: randomUUID(),
      workspaceId,
      equipmentId: input.equipmentId,
      kind: input.kind,
      movementDate: calendarDateToDb(input.movementDate),
      fromProjectId: input.fromProjectId,
      toProjectId: input.toProjectId,
      locationName: input.locationName,
      remark: input.remark ?? null,
      createdAt: new Date(),
      createdBy: by,
    },
  });
  if (input.kind !== "added")
    await prisma.constructionSiteWorkEquipment.update({
      where: { id: input.equipmentId },
      data: { currentProjectId: input.toProjectId },
    });
}

/** A maintenance entry; open when `endDate` is left out. */
export async function reportsMaintenance(
  workspaceId: string,
  by: string,
  input: {
    equipmentId: string;
    startDate: CalendarDate;
    endDate?: CalendarDate | null;
    kind?: "breakdown" | "service" | "repair" | "other";
    cost?: bigint | null;
    workshop?: string | null;
    description?: string | null;
  },
): Promise<void> {
  await prisma.constructionSiteWorkEquipmentMaintenance.create({
    data: {
      id: randomUUID(),
      workspaceId,
      equipmentId: input.equipmentId,
      kind: input.kind ?? "service",
      startDate: calendarDateToDb(input.startDate),
      endDate: input.endDate == null ? null : calendarDateToDb(input.endDate),
      cost: input.cost ?? null,
      workshop: input.workshop ?? "Sri Balaji Motors",
      description: input.description ?? null,
      ...reportsAudit(by),
    },
  });
}

/** A live Equipment Usage sheet with the figures the reports and dashboard read. */
export async function reportsUsageSheet(
  workspaceId: string,
  by: string,
  input: {
    equipmentId: string;
    projectId: string;
    sheetDate: CalendarDate;
    ownership?: "owned" | "rented";
    utilisationBasis?: "hourly" | "km" | "trip";
    shift?: "shift_1" | "shift_2" | "shift_3";
    operatorName?: string | null;
    contractorId?: string | null;
    usageHours?: string | null;
    distanceKm?: string | null;
    trips?: number | null;
    idleHours?: string;
    breakdownHours?: string;
    fuelQty?: string | null;
    fuelOverrun?: boolean;
    unitRate?: bigint | null;
    billableQty?: string | null;
    hireCost?: bigint | null;
    approval?: "not_required" | "pending" | "approved" | "rejected";
    deleted?: boolean;
  },
): Promise<{ id: string; number: string }> {
  const id = randomUUID();
  const number = `EU/${id.slice(0, 8)}`;
  await prisma.constructionSiteWorkEquipmentUsageSheet.create({
    data: {
      id,
      workspaceId,
      projectId: input.projectId,
      number,
      sheetDate: calendarDateToDb(input.sheetDate),
      shift: input.shift ?? "shift_1",
      equipmentId: input.equipmentId,
      ownership: input.ownership ?? "owned",
      utilisationBasis: input.utilisationBasis ?? "hourly",
      workingTimeMethod: "time_shifts",
      operatorName: input.operatorName ?? null,
      contractorId: input.contractorId ?? null,
      usageHours: input.usageHours ?? null,
      distanceKm: input.distanceKm ?? null,
      trips: input.trips ?? null,
      idleHours: input.idleHours ?? "0",
      breakdownHours: input.breakdownHours ?? "0",
      fuelQty: input.fuelQty ?? null,
      fuelBorneBy: input.fuelQty == null ? null : "company",
      fuelOverrun: input.fuelOverrun ?? false,
      unitRate: input.unitRate ?? null,
      billableQty: input.billableQty ?? null,
      hireCost: input.hireCost ?? null,
      approvalStatus: input.approval ?? "not_required",
      rejectionReason: input.approval === "rejected" ? "Hours wrong" : null,
      ...reportsAudit(by),
      deletedAt: input.deleted === true ? new Date() : null,
      deletedBy: input.deleted === true ? by : null,
    },
  });
  return { id, number };
}

// ---------------------------------------------------------------------------
// Progress reports (CM-606): rows for the Daily Progress Report's read
// model, written straight to the tables with the columns it reads.
// ---------------------------------------------------------------------------

const progressDay = (date: string) => new Date(`${date}T00:00:00.000Z`);

/** A live Department (masters). */
export async function progressAddDepartment(
  workspaceId: string,
  by: string,
  name = `RCC ${randomUUID().slice(0, 6)}`,
): Promise<string> {
  const id = randomUUID();
  await prisma.constructionMastersDepartment.create({
    data: { id, workspaceId, name, ...sharedAudit(by) },
  });
  return id;
}

/** A Labour Category with a skill (masters). */
export async function progressAddLabourCategory(
  workspaceId: string,
  by: string,
  skill: "skilled" | "unskilled",
): Promise<string> {
  const id = randomUUID();
  await prisma.constructionMastersLabourCategory.create({
    data: {
      id,
      workspaceId,
      name: `${skill} ${id.slice(0, 6)}`,
      skill,
      ...sharedAudit(by),
    },
  });
  return id;
}

/**
 * A live Daily Worksheet on `date`, created by `createdBy`, with material
 * lines. Contractor and Department are real rows so names resolve.
 */
export async function progressAddWorksheet(
  workspaceId: string,
  projectId: string,
  input: {
    date: string;
    createdBy: string;
    contractorId: string;
    departmentId: string;
    skilled?: number | null;
    unskilled?: number | null;
    shift?: "shift_1" | "shift_2" | "shift_3";
    remark?: string | null;
    approxWorkQty?: string | null;
    approxWorkUnitId?: string | null;
    materials?: {
      materialId: string;
      name: string;
      unit: string;
      quantity: string;
    }[];
  },
): Promise<{ id: string; number: string }> {
  const id = randomUUID();
  const number = sharedNumber("WS");
  await prisma.constructionSiteWorkWorksheet.create({
    data: {
      id,
      workspaceId,
      projectId,
      number,
      sheetDate: progressDay(input.date),
      shift: input.shift ?? "shift_1",
      contractorId: input.contractorId,
      departmentId: input.departmentId,
      skilledCount: input.skilled ?? null,
      unskilledCount: input.unskilled ?? null,
      approxWorkQty: input.approxWorkQty ?? null,
      approxWorkUnitId: input.approxWorkUnitId ?? null,
      remark: input.remark ?? null,
      ...sharedAudit(input.createdBy),
      materials: {
        create: (input.materials ?? []).map((line, index) => ({
          id: randomUUID(),
          materialId: line.materialId,
          materialName: line.name,
          unitName: line.unit,
          quantity: line.quantity,
          sortOrder: index,
        })),
      },
    },
  });
  return { id, number };
}

/**
 * A live Equipment Usage sheet on `date`, created by `createdBy`, on its
 * own equipment; rented sheets carry a hire cost in paise.
 */
export async function progressAddUsageSheet(
  workspaceId: string,
  projectId: string,
  input: {
    date: string;
    createdBy: string;
    ownership?: "owned" | "rented";
    hireCost?: bigint | null;
    usageHours?: string | null;
    timeShiftMinutes?: number[];
  },
): Promise<{ id: string; number: string; equipmentId: string }> {
  const ownership = input.ownership ?? "owned";
  const equipmentId = randomUUID();
  await prisma.constructionSiteWorkEquipment.create({
    data: {
      id: equipmentId,
      workspaceId,
      name: ownership === "rented" ? "Hired JCB 3DX" : "Mixer 10/7",
      equipmentNumber: `TN-${randomUUID().slice(0, 8)}`,
      ownership,
      utilisationBasis: "hourly",
      workingTimeMethod: "time_shifts",
      fuelType: "diesel",
      fuelUnit: "litre",
      ...(ownership === "rented"
        ? { hirePartyId: randomUUID(), hireBasis: "hourly", hireRate: 100_000n }
        : {}),
      currentProjectId: projectId,
      ...sharedAudit(input.createdBy),
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
      sheetDate: progressDay(input.date),
      shift: "shift_1",
      equipmentId,
      ownership,
      utilisationBasis: "hourly",
      workingTimeMethod: "time_shifts",
      operatorName: "Murugan",
      usageHours: input.usageHours ?? null,
      idleHours: "1.00",
      fuelQty: "18",
      fuelBorneBy: "company",
      hireCost: ownership === "rented" ? (input.hireCost ?? 650_000n) : null,
      unitRate: ownership === "rented" ? 100_000n : null,
      ...sharedAudit(input.createdBy),
      timeShifts: {
        create: (input.timeShiftMinutes ?? []).map((minutes, index) => ({
          id: randomUUID(),
          startTime: "08:00",
          endTime: "12:00",
          minutes,
          sortOrder: index,
        })),
      },
    },
  });
  return { id, number, equipmentId };
}
