import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it } from "vitest";

import { POST as markDays } from "@/app/api/construction/labour/attendance/labour/mark/route";
import { GET as getSheet } from "@/app/api/construction/labour/attendance/labour/sheet/route";
import { GET as getOpenApi } from "@/app/api/openapi.json/route";
import { createCheckInHandlers } from "@/src/labour/infrastructure/check-in-factory";
import type { Flag } from "@/src/shared-kernel/access";
import { addDays, todayIn } from "@/src/shared-kernel/calendar-date";
import { objectStorage } from "@/src/shared-kernel/files/storage-from-env";
import { newId } from "@/src/shared-kernel/ids";
import {
  addProject,
  jsonRequest,
  memberWith,
  ownerWithCompany,
} from "@/test/companies";
import { seedEmployee, seededRoleId } from "@/test/employees";
import { bytesOf, gifBytes, pngBytes } from "@/test/files";
import { TEST_ORIGIN } from "@/test/sessions";

import { GET as getEntryPhoto } from "./[id]/photo/route";
import { POST as voidCheckIn } from "./[id]/void/route";
import type {
  ConstructionLabourCheckInDayResponseModel as DayEffect,
  GetConstructionLabourCheckInPersonResponseModel as PersonPage,
  ListConstructionLabourCheckInEntriesResponseModel as LogPage,
  ListConstructionLabourCheckInPeopleResponseModel as PeoplePage,
  RecordConstructionLabourCheckInResponseModel as Recorded,
  VoidConstructionLabourCheckInResponseModel as Voided,
} from "./check-in-models";
import { GET as getRecordPhoto } from "./people/[kind]/[personId]/photo/route";
import { GET as listPeople } from "./people/route";
import { GET as getPerson } from "./person/route";
import { GET as listEntries, POST as recordCheckIn } from "./route";

const BASE = `${TEST_ORIGIN}/api/construction/labour/attendance/check-ins`;
const ATTENDANCE = `${TEST_ORIGIN}/api/construction/labour/attendance/labour`;

type Company = Awaited<ReturnType<typeof ownerWithCompany>>;

const TODAY = todayIn("Asia/Kolkata");
const YESTERDAY = addDays(TODAY, -1);
const DAILY = 70_000;
const OT = 10_000;

/** Chennai; the Site fence's centre. */
const SITE = { latitude: 13.0827, longitude: 80.2707 };

/** An instant on the Company's wall clock (India, UTC+05:30). */
function at(date: string, time: string): Date {
  return new Date(`${date}T${time}:00+05:30`);
}

const PHOTO = Buffer.from(pngBytes(2048)).toString("base64");

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function failure(
  response: Response,
): Promise<{ status: number; code: string; details: unknown }> {
  const body = await json<{ code: string; details?: unknown }>(response);
  return { status: response.status, code: body.code, details: body.details };
}

async function seedCategory(workspaceId: string, name: string) {
  const id = newId();
  await prisma.constructionMastersLabourCategory.create({
    data: {
      id,
      workspaceId,
      name: `${name} ${id.slice(-6)}`,
      createdBy: "test",
      updatedBy: "test",
    },
  });
  return id;
}

/**
 * An Employee on the Site Engineer Role, on `projectIds` (ADR CM-0055): a
 * person like any other Employee, whose check-ins write attendance.
 */
async function seedSiteEngineer(
  workspaceId: string,
  name: string,
  projectIds: readonly string[],
  extra: { inactive?: boolean } = {},
) {
  const id = await seedEmployee({
    workspaceId,
    name,
    roleId: await seededRoleId(workspaceId, "Site Engineer"),
    mobile: "+919876500011",
    employeeCode: `SE-${newId().slice(-4)}`,
    joiningDate: "2026-09-01",
    wagePerDay: DAILY,
    overtimeWagePerHour: OT,
    weeklyHolidays: [],
    projectIds,
    isActive: extra.inactive !== true,
  });
  return id;
}

async function seedVendor(
  workspaceId: string,
  name: string,
  projectIds: readonly string[],
  extra: { inactive?: boolean } = {},
) {
  const id = newId();
  await prisma.constructionLabourVendor.create({
    data: {
      id,
      workspaceId,
      name,
      joiningDate: new Date("2026-01-01T00:00:00Z"),
      contactNumber: "+919876500022",
      isActive: extra.inactive !== true,
      createdBy: "test",
      updatedBy: "test",
      projects: { create: projectIds.map((projectId) => ({ projectId })) },
    },
  });
  return id;
}

async function seedFence(workspaceId: string, projectId: string) {
  await prisma.constructionHrmsBranch.create({
    data: {
      id: newId(),
      workspaceId,
      kind: "project_site",
      name: "Tower A site",
      projectId,
      latitude: SITE.latitude,
      longitude: SITE.longitude,
      radiusMetres: 100,
      createdBy: "test",
      updatedBy: "test",
    },
  });
}

async function fixtures(company: Company) {
  const [tower, villa, mason] = await Promise.all([
    addProject(company.workspaceId, company.userId, "Tower A"),
    addProject(company.workspaceId, company.userId, "Villa"),
    seedCategory(company.workspaceId, "Mason"),
  ]);
  const labour = (name: string, projectIds = [tower]) =>
    seedEmployee({
      workspaceId: company.workspaceId,
      name,
      joiningDate: "2026-09-01",
      wagePerDay: DAILY,
      overtimeWagePerHour: OT,
      weeklyHolidays: [],
      projectIds,
      labourCategoryId: mason,
      mobile: "+919876500033",
    });
  const dhuresh = await labour("Dhuresh Nawin");
  return {
    tower,
    villa,
    mason,
    dhuresh,
    labour,
    vendor: await seedVendor(company.workspaceId, "Selvam Gang", [tower]),
    engineer: await seedSiteEngineer(company.workspaceId, "Sundar", [tower]),
  };
}

type Fixtures = Awaited<ReturnType<typeof fixtures>>;

function post(cookie: string, body: Record<string, unknown>) {
  return recordCheckIn(jsonRequest(BASE, cookie, body));
}

function entryBody(
  f: Fixtures,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    projectId: f.tower,
    kind: "employee",
    personId: f.dhuresh,
    action: "check_in",
    photo: PHOTO,
    ...overrides,
  };
}

async function recorded(
  cookie: string,
  body: Record<string, unknown>,
): Promise<Recorded> {
  const response = await post(cookie, body);
  if (response.status !== 201)
    throw new Error(
      `check-in: ${String(response.status)} ${await response.text()}`,
    );
  return json<Recorded>(response);
}

function voidEntry(cookie: string, id: string, reason: string) {
  return voidCheckIn(jsonRequest(`${BASE}/${id}/void`, cookie, { reason }), {
    params: Promise.resolve({ id }),
  });
}

/** Handlers on a clock of the test's choosing, as the routes build them. */
function handlersAt(clock: { now: Date }) {
  return createCheckInHandlers({ clock: () => clock.now });
}

async function ledgerSum(employeeId: string): Promise<number> {
  const sum = await prisma.constructionLabourLedgerEntry.aggregate({
    where: { partyId: employeeId, sourceType: "employee_attendance" },
    _sum: { amount: true },
  });
  return sum._sum.amount ?? 0;
}

async function liveDays(employeeId: string) {
  return prisma.constructionLabourAttendance.findMany({
    where: { employeeId, deletedAt: null },
    include: { overtime: true },
  });
}

async function audits(workspaceId: string, prefix: string) {
  const rows = await prisma.constructionOrganizationAuditEvent.findMany({
    where: { workspaceId, action: { startsWith: prefix } },
    orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
  });
  return rows.map((row) => row.action);
}

async function photoFiles(workspaceId: string) {
  return prisma.constructionOrganizationStoredFile.findMany({
    where: { workspaceId, kind: "check_in_photo" },
  });
}

async function photoObjects(workspaceId: string): Promise<number> {
  const page = await objectStorage().list(
    `companies/${workspaceId}/check-in-photos/`,
  );
  return page.objects.length;
}

async function member(
  company: Company,
  permissions: Record<string, Flag[]>,
  projectIds: string[],
) {
  const joined = await memberWith(company, permissions);
  for (const projectId of projectIds)
    await prisma.constructionOrganizationTeamMemberProject.create({
      data: { memberId: joined.memberId, projectId },
    });
  return joined;
}

type SheetDay = {
  id: string;
  status: string;
  checkIn: string | null;
  checkOut: string | null;
  breakMinutes: number | null;
  timesFromCheckIn?: boolean;
  updatedAt: string;
};

async function sheetDay(
  company: Company,
  f: Fixtures,
  date = TODAY,
): Promise<SheetDay | null> {
  const response = await getSheet(
    jsonRequest(
      `${ATTENDANCE}/sheet?projectId=${f.tower}&date=${date}`,
      company.cookie,
    ),
  );
  const body = await json<{
    employees: { employeeId: string; attendance: SheetDay | null }[];
  }>(response);
  return (
    body.employees.find((row) => row.employeeId === f.dhuresh)?.attendance ??
    null
  );
}

async function markOnSheet(
  company: Company,
  f: Fixtures,
  mark: Record<string, unknown>,
  expected?: string,
) {
  const response = await markDays(
    jsonRequest(`${ATTENDANCE}/mark`, company.cookie, {
      projectId: f.tower,
      date: TODAY,
      marks: [{ employeeId: f.dhuresh, ...mark }],
      ...(expected == null ? {} : { expected: { [f.dhuresh]: expected } }),
    }),
  );
  if (response.status !== 200)
    throw new Error(`mark: ${await response.text()}`);
}

describe("recording a check-in entry (ADR CM-0043)", () => {
  it("records each kind of person with their photo; a Labour's first Check In marks them Present and posts the wage", async () => {
    const company = await ownerWithCompany();
    const f = await fixtures(company);

    const labour = await recorded(company.cookie, entryBody(f));
    expect(labour.repeated).toBe(false);
    expect(labour.entry).toMatchObject({
      projectId: f.tower,
      kind: "employee",
      personId: f.dhuresh,
      personName: "Dhuresh Nawin",
      action: "check_in",
      date: TODAY,
      hasPhoto: true,
      location: null,
      fence: null,
      metresOutside: null,
      recordedBy: { id: company.userId },
      voided: null,
    });
    // An Employee shows their Role (ADR CM-0055).
    expect(labour.entry.role).toBe("Labour");
    expect(labour.person).toMatchObject({
      kind: "employee",
      name: "Dhuresh Nawin",
      hasPhoto: false,
      state: { status: "in", since: labour.entry.at },
      entriesToday: 1,
    });
    expect(labour.day).toMatchObject({
      effect: "created",
      status: "present",
      checkOut: null,
      breakMinutes: 60,
      note: null,
    });
    expect(labour.day?.checkIn).toMatch(/^\d\d:\d\d$/);

    // The day as the sheet would have written it: priced, posted, audited.
    const [day] = await liveDays(f.dhuresh);
    expect(day).toMatchObject({
      projectId: f.tower,
      status: "present",
      earned: DAILY,
      wageRate: DAILY,
      fromCheckIn: true,
      timesFromCheckIn: true,
    });
    expect(await ledgerSum(f.dhuresh)).toBe(DAILY);
    expect(await audits(company.workspaceId, "labour_attendance.")).toEqual([
      "labour_attendance.marked",
    ]);
    expect((await sheetDay(company, f))?.timesFromCheckIn).toBe(true);

    const vendor = await recorded(
      company.cookie,
      entryBody(f, { kind: "vendor", personId: f.vendor }),
    );
    expect(vendor.entry).toMatchObject({
      kind: "vendor",
      personName: "Selvam Gang",
      role: "Vendor",
    });
    expect(vendor.person).toMatchObject({
      phone: "+919876500022",
      code: null,
      state: { status: "in" },
    });
    expect(vendor.day).toBeNull();

    // A Site Engineer is an Employee: their Check In marks their day too.
    const engineer = await recorded(
      company.cookie,
      entryBody(f, { personId: f.engineer }),
    );
    expect(engineer.entry).toMatchObject({
      kind: "employee",
      personName: "Sundar",
      role: "Site Engineer",
    });
    expect(engineer.person.code).toMatch(/^SE-/);
    expect(engineer.day).toMatchObject({
      effect: "created",
      status: "present",
    });
    expect(await ledgerSum(f.engineer)).toBe(DAILY);

    // Every entry's photo is private, counted, and recorded with it.
    const files = await photoFiles(company.workspaceId);
    expect(files).toHaveLength(3);
    for (const file of files)
      expect(file).toMatchObject({
        contentType: "image/png",
        bytes: 2048,
        deletedAt: null,
      });
    expect(await photoObjects(company.workspaceId)).toBe(3);
    const rows = await prisma.constructionLabourCheckInEvent.findMany({
      where: { workspaceId: company.workspaceId },
    });
    expect(rows.map((row) => row.photoKey).sort()).toEqual(
      files.map((file) => file.key).sort(),
    );
    expect(await audits(company.workspaceId, "check_in.")).toEqual([
      "check_in.recorded",
      "check_in.recorded",
      "check_in.recorded",
    ]);
    // A Vendor's entry changes no attendance.
    expect(
      await prisma.constructionLabourVendorAttendance.count({
        where: { workspaceId: company.workspaceId },
      }),
    ).toBe(0);
  });

  it("refuses a person who may not be checked in, and stores no photo for them", async () => {
    const company = await ownerWithCompany();
    const f = await fixtures(company);
    const elsewhere = await f.labour("Murugan", [f.villa]);
    const resting = await f.labour("Anbu");
    await prisma.constructionLabourEmployee.update({
      where: { id: resting },
      data: { isActive: false },
    });
    const [idleVendor, villaVendor] = await Promise.all([
      seedVendor(company.workspaceId, "Idle Gang", [f.tower], {
        inactive: true,
      }),
      seedVendor(company.workspaceId, "Villa Gang", [f.villa]),
    ]);
    const cases: [Record<string, unknown>, number, string][] = [
      [{ personId: newId() }, StatusCodes.NOT_FOUND, "EMPLOYEE_NOT_FOUND"],
      [{ personId: resting }, StatusCodes.BAD_REQUEST, "EMPLOYEE_INACTIVE"],
      [
        { personId: elsewhere },
        StatusCodes.BAD_REQUEST,
        "EMPLOYEE_NOT_ON_PROJECT",
      ],
      [
        { kind: "vendor", personId: newId() },
        StatusCodes.NOT_FOUND,
        "VENDOR_NOT_FOUND",
      ],
      [
        { kind: "vendor", personId: idleVendor },
        StatusCodes.BAD_REQUEST,
        "VENDOR_INACTIVE",
      ],
      [
        { kind: "vendor", personId: villaVendor },
        StatusCodes.BAD_REQUEST,
        "VENDOR_NOT_ON_PROJECT",
      ],
      // The old kinds are gone (ADR CM-0055).
      [
        { kind: "site_engineer", personId: f.engineer },
        StatusCodes.BAD_REQUEST,
        "VALIDATION_ERROR",
      ],
      [
        { kind: "labour", personId: f.dhuresh },
        StatusCodes.BAD_REQUEST,
        "VALIDATION_ERROR",
      ],
      [{ projectId: newId() }, StatusCodes.NOT_FOUND, "PROJECT_NOT_FOUND"],
      // An Employee with a Check Out and no open Check In.
      [{ action: "check_out" }, StatusCodes.CONFLICT, "NOT_CHECKED_IN"],
    ];
    for (const [overrides, status, code] of cases)
      expect(
        await failure(await post(company.cookie, entryBody(f, overrides))),
        code,
      ).toMatchObject({ status, code });
    expect(await photoFiles(company.workspaceId)).toHaveLength(0);
    expect(await photoObjects(company.workspaceId)).toBe(0);
    expect(await liveDays(f.dhuresh)).toHaveLength(0);
  });

  it("refuses a missing, non-image or too-large photo, and a location that is not a place", async () => {
    const company = await ownerWithCompany();
    const f = await fixtures(company);
    const { photo: _photo, ...noPhoto } = entryBody(f);
    expect((await failure(await post(company.cookie, noPhoto))).code).toBe(
      "VALIDATION_ERROR",
    );
    for (const photo of [
      Buffer.from(gifBytes()).toString("base64"),
      "not base64 at all!",
      Buffer.from("plain text").toString("base64"),
    ])
      expect(
        await failure(await post(company.cookie, entryBody(f, { photo }))),
      ).toMatchObject({
        status: StatusCodes.BAD_REQUEST,
        code: "PHOTO_INVALID",
        details: { field: "photo" },
      });
    const large = Buffer.from(pngBytes(1024 * 1024 + 1)).toString("base64");
    expect(
      await failure(await post(company.cookie, entryBody(f, { photo: large }))),
    ).toMatchObject({
      status: StatusCodes.BAD_REQUEST,
      code: "PHOTO_TOO_LARGE",
      details: { field: "photo" },
    });
    expect(
      await failure(
        await post(
          company.cookie,
          entryBody(f, { location: { latitude: 120, longitude: 80 } }),
        ),
      ),
    ).toMatchObject({
      code: "LOCATION_INVALID",
      details: { field: "location" },
    });
    // A data URL is read as its base64.
    const dataUrl = await recorded(
      company.cookie,
      entryBody(f, { photo: `data:image/png;base64,${PHOTO}` }),
    );
    expect(dataUrl.entry.hasPhoto).toBe(true);
    expect(await photoFiles(company.workspaceId)).toHaveLength(1);
  });

  it("keeps a person's entries in order: a second Check In or a stray Check Out is refused, a repeat within two minutes writes nothing", async () => {
    const company = await ownerWithCompany();
    const f = await fixtures(company);
    const clock = { now: at(TODAY, "10:02") };
    const handlers = handlersAt(clock);
    const record = (action: "check_in" | "check_out") =>
      handlers.record({
        workspaceId: company.workspaceId,
        userId: company.userId,
        projectId: f.tower,
        kind: "vendor",
        personId: f.vendor,
        action,
        photo: PHOTO,
      });
    const first = await record("check_in");
    expect(first.repeated).toBe(false);

    // A double tap: the same entry back, no row, no photo.
    clock.now = at(TODAY, "10:03");
    const again = await record("check_in");
    expect(again.repeated).toBe(true);
    expect(again.entry.id).toBe(first.entry.id);
    expect(again.day).toBeNull();
    expect(await photoFiles(company.workspaceId)).toHaveLength(1);
    expect(await photoObjects(company.workspaceId)).toBe(1);

    // Past two minutes it is a second Check In.
    clock.now = at(TODAY, "10:05");
    await expect(record("check_in")).rejects.toMatchObject({
      code: "ALREADY_CHECKED_IN",
      details: { since: first.entry.at.toISOString() },
    });
    const out = await record("check_out");
    expect(out.person.state).toEqual({
      status: "out",
      since: at(TODAY, "10:05"),
    });
    clock.now = at(TODAY, "10:06");
    expect((await record("check_out")).repeated).toBe(true);
    clock.now = at(TODAY, "10:08");
    await expect(record("check_out")).rejects.toMatchObject({
      code: "NOT_CHECKED_IN",
    });
    expect(
      await prisma.constructionLabourCheckInEvent.count({
        where: { workspaceId: company.workspaceId },
      }),
    ).toBe(2);
    expect(await photoFiles(company.workspaceId)).toHaveLength(2);
    expect(await photoObjects(company.workspaceId)).toBe(2);

    // Through the route: a repeat answers 200.
    const viaRoute = await post(
      company.cookie,
      entryBody(f, { personId: f.engineer }),
    );
    expect(viaRoute.status).toBe(StatusCodes.CREATED);
    const repeat = await post(
      company.cookie,
      entryBody(f, { personId: f.engineer }),
    );
    expect(repeat.status).toBe(StatusCodes.OK);
    expect((await json<Recorded>(repeat)).repeated).toBe(true);
  });

  it("works a Labour's In, Out and break out from their entries, with a lunch gap and overtime from the times", async () => {
    const company = await ownerWithCompany();
    const f = await fixtures(company);
    const clock = { now: at(TODAY, "09:00") };
    const handlers = handlersAt(clock);
    const step = async (time: string, action: "check_in" | "check_out") => {
      clock.now = at(TODAY, time);
      const result = await handlers.record({
        workspaceId: company.workspaceId,
        userId: company.userId,
        projectId: f.tower,
        kind: "employee",
        personId: f.dhuresh,
        action,
        photo: PHOTO,
      });
      return result.day;
    };
    const days: (DayEffect | null)[] = [];
    days.push(await step("09:00", "check_in"));
    days.push(await step("13:00", "check_out"));
    days.push(await step("13:45", "check_in"));
    days.push(await step("18:30", "check_out"));
    expect(days).toEqual([
      // No Out yet: the 60-minute default break.
      {
        effect: "created",
        status: "present",
        checkIn: "09:00",
        checkOut: null,
        breakMinutes: 60,
        note: null,
      },
      // Out with no gap recorded: the default stays.
      {
        effect: "updated",
        status: "present",
        checkIn: "09:00",
        checkOut: "13:00",
        breakMinutes: 60,
        note: null,
      },
      // Back in after lunch: the real gap, and no Out while in.
      {
        effect: "updated",
        status: "present",
        checkIn: "09:00",
        checkOut: null,
        breakMinutes: 45,
        note: null,
      },
      {
        effect: "updated",
        status: "present",
        checkIn: "09:00",
        checkOut: "18:30",
        breakMinutes: 45,
        note: null,
      },
    ]);
    // 9 h 30 min − 45 min break − 8 h = 0.75 h overtime at ₹100 an hour.
    const [day] = await liveDays(f.dhuresh);
    expect(day).toMatchObject({
      status: "present",
      checkIn: "09:00",
      checkOut: "18:30",
      breakMinutes: 45,
      earned: DAILY,
      fromCheckIn: true,
      timesFromCheckIn: true,
    });
    expect(
      day?.overtime.map((line) => ({
        labourCategoryId: line.labourCategoryId,
        hours: line.hours.toString(),
        amount: line.amount,
        fromTimes: line.fromTimes,
      })),
    ).toEqual([
      {
        labourCategoryId: f.mason,
        hours: "0.75",
        amount: 7_500,
        fromTimes: true,
      },
    ]);
    expect(await ledgerSum(f.dhuresh)).toBe(DAILY + 7_500);
    expect(await audits(company.workspaceId, "labour_attendance.")).toEqual([
      "labour_attendance.marked",
      "labour_attendance.updated",
      "labour_attendance.updated",
      "labour_attendance.updated",
    ]);
  });

  it("times an entry once the person's lock is held, not when the request arrived", async () => {
    const company = await ownerWithCompany();
    const f = await fixtures(company);
    // The clock moves on with every reading, as it does while a photo uploads.
    const arrived = at(TODAY, "10:00");
    let readings = 0;
    const handlers = createCheckInHandlers({
      clock: () => new Date(arrived.getTime() + readings++ * 60_000),
    });
    const first = await handlers.record({
      workspaceId: company.workspaceId,
      userId: company.userId,
      projectId: f.tower,
      kind: "employee",
      personId: f.dhuresh,
      action: "check_in",
      photo: PHOTO,
    });
    expect(readings).toBeGreaterThan(1);
    // The last reading is the one taken under the lock.
    expect(new Date(first.entry.at).getTime()).toBe(
      arrived.getTime() + (readings - 1) * 60_000,
    );
    expect(first.person.state).toMatchObject({
      status: "in",
      since: new Date(first.entry.at),
    });
  });

  it("keeps a night shift's Check Out on the day it began, and after 16 hours starts a new day", async () => {
    const company = await ownerWithCompany();
    const f = await fixtures(company);
    const clock = { now: at(YESTERDAY, "20:00") };
    const handlers = handlersAt(clock);
    const record = (action: "check_in" | "check_out") =>
      handlers.record({
        workspaceId: company.workspaceId,
        userId: company.userId,
        projectId: f.tower,
        kind: "employee",
        personId: f.dhuresh,
        action,
        photo: PHOTO,
      });
    await record("check_in");
    clock.now = at(TODAY, "06:00");
    const out = await record("check_out");
    expect(out.entry.date).toBe(YESTERDAY);
    expect(out.day).toMatchObject({
      effect: "updated",
      checkIn: "20:00",
      checkOut: "06:00",
      breakMinutes: 60,
    });
    // Forgotten: a Check In left open more than 16 hours no longer counts.
    clock.now = at(TODAY, "07:00");
    const morning = await record("check_in");
    expect(morning.entry.date).toBe(TODAY);
    clock.now = at(addDays(TODAY, 1), "00:30");
    await expect(record("check_out")).rejects.toMatchObject({
      code: "NOT_CHECKED_IN",
    });
    const days = await liveDays(f.dhuresh);
    expect(days).toHaveLength(2);
    const today = days.find(
      (day) => day.attendanceDate.toISOString().slice(0, 10) === TODAY,
    );
    expect(today).toMatchObject({ checkIn: "07:00", checkOut: null });
  });

  it("leaves a day with times typed on the sheet alone, with the note", async () => {
    const company = await ownerWithCompany();
    const f = await fixtures(company);
    await markOnSheet(company, f, {
      status: "present",
      checkIn: "08:00",
      checkOut: "17:00",
      breakMinutes: 30,
    });
    const before = await liveDays(f.dhuresh);
    const result = await recorded(company.cookie, entryBody(f));
    expect(result.day).toEqual({
      effect: "kept",
      status: "present",
      checkIn: "08:00",
      checkOut: "17:00",
      breakMinutes: 30,
      note: "The times typed on the attendance sheet were kept.",
    });
    const after = await liveDays(f.dhuresh);
    expect(after[0]?.updatedAt).toEqual(before[0]?.updatedAt);
    expect(after[0]).toMatchObject({
      fromCheckIn: false,
      timesFromCheckIn: false,
    });
    expect(await ledgerSum(f.dhuresh)).toBe(DAILY);
  });

  it("leaves a day marked Absent alone, with the note", async () => {
    const company = await ownerWithCompany();
    const f = await fixtures(company);
    await markOnSheet(company, f, { status: "absent" });
    const result = await recorded(company.cookie, entryBody(f));
    expect(result.entry.hasPhoto).toBe(true);
    expect(result.day).toEqual({
      effect: "kept",
      status: "absent",
      checkIn: null,
      checkOut: null,
      breakMinutes: null,
      note: "Marked Absent on the attendance sheet. Change it there if that is wrong.",
    });
    expect((await liveDays(f.dhuresh))[0]).toMatchObject({
      status: "absent",
      checkIn: null,
    });
    expect(await ledgerSum(f.dhuresh)).toBe(0);
  });

  it("on the sheet, turns fromCheckIn off and keeps the log's times only while they are sent back unchanged", async () => {
    const company = await ownerWithCompany();
    const f = await fixtures(company);
    const clock = { now: at(TODAY, "09:00") };
    const handlers = handlersAt(clock);
    const record = (time: string, action: "check_in" | "check_out") => {
      clock.now = at(TODAY, time);
      return handlers.record({
        workspaceId: company.workspaceId,
        userId: company.userId,
        projectId: f.tower,
        kind: "employee",
        personId: f.dhuresh,
        action,
        photo: PHOTO,
      });
    };
    await record("09:00", "check_in");
    await record("17:00", "check_out");
    const logged = await sheetDay(company, f);
    expect(logged).toMatchObject({
      checkIn: "09:00",
      checkOut: "17:00",
      breakMinutes: 60,
      timesFromCheckIn: true,
    });

    // Half Day with the same times: still from the log.
    await markOnSheet(
      company,
      f,
      {
        status: "half_day",
        checkIn: "09:00",
        checkOut: "17:00",
        breakMinutes: 60,
      },
      logged?.updatedAt,
    );
    expect((await liveDays(f.dhuresh))[0]).toMatchObject({
      status: "half_day",
      fromCheckIn: false,
      timesFromCheckIn: true,
    });
    const back = await record("18:00", "check_in");
    expect(back.day).toMatchObject({
      effect: "updated",
      status: "half_day",
      checkIn: "09:00",
      checkOut: null,
      breakMinutes: 60,
    });
    const out = await record("19:00", "check_out");
    expect(out.day).toMatchObject({
      effect: "updated",
      checkOut: "19:00",
      breakMinutes: 60,
    });

    // Other times typed: the log no longer touches them.
    const typed = await sheetDay(company, f);
    await markOnSheet(
      company,
      f,
      {
        status: "half_day",
        checkIn: "09:00",
        checkOut: "18:00",
        breakMinutes: 60,
      },
      typed?.updatedAt,
    );
    expect(await sheetDay(company, f)).toMatchObject({
      checkOut: "18:00",
      timesFromCheckIn: false,
    });
    const later = await record("20:00", "check_in");
    expect(later.day).toMatchObject({
      effect: "kept",
      checkOut: "18:00",
      note: "The times typed on the attendance sheet were kept.",
    });
  });

  it("serialises two Check Ins sent at once for one Labour: one entry, one day, one wage", async () => {
    const company = await ownerWithCompany();
    const f = await fixtures(company);
    const responses = await Promise.all([
      post(company.cookie, entryBody(f)),
      post(company.cookie, entryBody(f)),
    ]);
    const statuses = responses.map((response) => response.status).sort();
    expect([
      [StatusCodes.OK, StatusCodes.CREATED],
      [StatusCodes.CREATED, StatusCodes.CONFLICT],
    ]).toContainEqual(statuses);
    expect(
      await prisma.constructionLabourCheckInEvent.count({
        where: { workspaceId: company.workspaceId },
      }),
    ).toBe(1);
    expect(await liveDays(f.dhuresh)).toHaveLength(1);
    expect(await ledgerSum(f.dhuresh)).toBe(DAILY);
    expect(await photoFiles(company.workspaceId)).toHaveLength(1);
    expect(await photoObjects(company.workspaceId)).toBe(1);
  });

  it("flags an entry outside the Site fence and accepts it; no location is accepted too", async () => {
    const company = await ownerWithCompany();
    const f = await fixtures(company);
    await seedFence(company.workspaceId, f.tower);
    const inside = await recorded(
      company.cookie,
      entryBody(f, {
        location: { ...SITE, accuracyMetres: 12.5 },
      }),
    );
    expect(inside.entry).toMatchObject({
      location: { ...SITE, accuracyMetres: 12.5 },
      fence: "inside",
      metresOutside: 0,
    });
    // About 1.1 km north of the centre: flagged, never refused.
    const outside = await recorded(
      company.cookie,
      entryBody(f, {
        kind: "vendor",
        personId: f.vendor,
        location: { latitude: SITE.latitude + 0.01, longitude: SITE.longitude },
      }),
    );
    expect(outside.entry.fence).toBe("outside");
    expect(outside.entry.metresOutside).toBeGreaterThan(1_000);
    expect(outside.entry.metresOutside).toBeLessThan(1_050);
    expect(outside.entry.location?.accuracyMetres).toBeNull();
    const none = await recorded(
      company.cookie,
      entryBody(f, { personId: f.engineer }),
    );
    expect(none.entry).toMatchObject({
      location: null,
      fence: null,
      metresOutside: null,
    });
    // No fence on the Project: the location is kept, unmarked.
    const elsewhere = await seedVendor(company.workspaceId, "Villa Gang", [
      f.villa,
    ]);
    const unfenced = await recorded(
      company.cookie,
      entryBody(f, {
        projectId: f.villa,
        kind: "vendor",
        personId: elsewhere,
        location: SITE,
      }),
    );
    expect(unfenced.entry).toMatchObject({
      location: { ...SITE, accuracyMetres: null },
      fence: null,
      metresOutside: null,
    });
  });

  it("needs Attendance Create on the Project; a member off the Project is refused", async () => {
    const company = await ownerWithCompany();
    const f = await fixtures(company);
    const reader = await member(company, { "labour.attendance": ["read"] }, [
      f.tower,
    ]);
    expect(
      await failure(await post(reader.cookie, entryBody(f))),
    ).toMatchObject({
      status: StatusCodes.FORBIDDEN,
      code: "PERMISSION_DENIED",
    });
    const offProject = await member(
      company,
      { "labour.attendance": ["read", "create", "delete"] },
      [f.villa],
    );
    expect(
      await failure(await post(offProject.cookie, entryBody(f))),
    ).toMatchObject({
      status: StatusCodes.FORBIDDEN,
      code: "PERMISSION_DENIED",
    });
    // Create alone checks a Labour in, and the day is marked: no Update needed.
    const creator = await member(
      company,
      { "labour.attendance": ["read", "create"] },
      [f.tower],
    );
    const result = await recorded(creator.cookie, entryBody(f));
    expect(result.entry.recordedBy).toEqual({
      id: creator.userId,
      name: "Member",
    });
    expect(result.day?.effect).toBe("created");
    expect(await ledgerSum(f.dhuresh)).toBe(DAILY);
    expect(await photoFiles(company.workspaceId)).toHaveLength(1);
  });
});

describe("voiding a check-in entry (ADR CM-0043)", () => {
  it("voids the only entry of a day Check-In made: the day is cleared and the wage reversed; the photo stays", async () => {
    const company = await ownerWithCompany();
    const f = await fixtures(company);
    const entry = (await recorded(company.cookie, entryBody(f))).entry;
    expect(await ledgerSum(f.dhuresh)).toBe(DAILY);

    const response = await voidEntry(
      company.cookie,
      entry.id,
      "  Checked in the wrong person  ",
    );
    expect(response.status).toBe(StatusCodes.OK);
    const voided = await json<Voided>(response);
    expect(voided.entry).toMatchObject({
      id: entry.id,
      hasPhoto: true,
      voided: {
        by: { id: company.userId },
        reason: "Checked in the wrong person",
      },
    });
    expect(voided.person).toMatchObject({
      state: { status: "none", since: null },
      entriesToday: 0,
    });
    expect(voided.day).toEqual({
      effect: "cleared",
      status: null,
      checkIn: null,
      checkOut: null,
      breakMinutes: null,
      note: null,
    });
    expect(await liveDays(f.dhuresh)).toHaveLength(0);
    expect(await ledgerSum(f.dhuresh)).toBe(0);
    expect(await audits(company.workspaceId, "labour_attendance.")).toEqual([
      "labour_attendance.marked",
      "labour_attendance.cleared",
    ]);
    expect(await audits(company.workspaceId, "check_in.")).toEqual([
      "check_in.recorded",
      "check_in.voided",
    ]);
    // Evidence of what was voided: the photo stays until retention.
    const [file] = await photoFiles(company.workspaceId);
    expect(file?.deletedAt).toBeNull();
    expect(await photoObjects(company.workspaceId)).toBe(1);

    expect(
      await failure(await voidEntry(company.cookie, entry.id, "Again")),
    ).toMatchObject({
      status: StatusCodes.CONFLICT,
      code: "CHECK_IN_ALREADY_VOIDED",
    });
    // The Labour can be checked in again; a new day is made.
    const again = await recorded(company.cookie, entryBody(f));
    expect(again.day?.effect).toBe("created");
    expect(await ledgerSum(f.dhuresh)).toBe(DAILY);
  });

  it("voids one of several entries and works the day out again", async () => {
    const company = await ownerWithCompany();
    const f = await fixtures(company);
    const clock = { now: at(TODAY, "09:00") };
    const handlers = handlersAt(clock);
    const record = async (time: string, action: "check_in" | "check_out") => {
      clock.now = at(TODAY, time);
      return (
        await handlers.record({
          workspaceId: company.workspaceId,
          userId: company.userId,
          projectId: f.tower,
          kind: "employee",
          personId: f.dhuresh,
          action,
          photo: PHOTO,
        })
      ).entry;
    };
    await record("09:00", "check_in");
    const lunch = await record("13:00", "check_out");
    await record("13:30", "check_in");
    const evening = await record("18:00", "check_out");
    expect((await liveDays(f.dhuresh))[0]).toMatchObject({
      checkOut: "18:00",
      breakMinutes: 30,
    });

    // Without the lunch Check Out there is no gap: the default break.
    const noLunch = await json<Voided>(
      await voidEntry(company.cookie, lunch.id, "Wrong button"),
    );
    expect(noLunch.day).toEqual({
      effect: "updated",
      status: "present",
      checkIn: "09:00",
      checkOut: "18:00",
      breakMinutes: 60,
      note: null,
    });
    // Without the last Check Out the Labour reads as still in.
    const noOut = await json<Voided>(
      await voidEntry(company.cookie, evening.id, "Not yet gone"),
    );
    expect(noOut.day).toMatchObject({
      effect: "updated",
      checkIn: "09:00",
      checkOut: null,
    });
    const [day] = await liveDays(f.dhuresh);
    expect(day).toMatchObject({
      status: "present",
      checkOut: null,
      fromCheckIn: true,
      timesFromCheckIn: true,
    });
    expect(day?.overtime).toEqual([]);
    expect(await ledgerSum(f.dhuresh)).toBe(DAILY);
  });

  it("voids the last entry of a day the sheet saved: the times from Check-In go, the status stays", async () => {
    const company = await ownerWithCompany();
    const f = await fixtures(company);
    const entry = (await recorded(company.cookie, entryBody(f))).entry;
    const logged = await sheetDay(company, f);
    await markOnSheet(
      company,
      f,
      {
        status: "present",
        checkIn: logged?.checkIn,
        checkOut: null,
        breakMinutes: 60,
      },
      logged?.updatedAt,
    );
    const voided = await json<Voided>(
      await voidEntry(company.cookie, entry.id, "Wrong person"),
    );
    expect(voided.day).toEqual({
      effect: "updated",
      status: "present",
      checkIn: null,
      checkOut: null,
      breakMinutes: null,
      note: null,
    });
    expect((await liveDays(f.dhuresh))[0]).toMatchObject({
      status: "present",
      checkIn: null,
      fromCheckIn: false,
      timesFromCheckIn: false,
    });
    expect(await ledgerSum(f.dhuresh)).toBe(DAILY);
  });

  it("voids a Vendor's entry as a log only, and needs a reason", async () => {
    const company = await ownerWithCompany();
    const f = await fixtures(company);
    const entry = (
      await recorded(
        company.cookie,
        entryBody(f, { kind: "vendor", personId: f.vendor }),
      )
    ).entry;
    expect(
      await failure(await voidEntry(company.cookie, entry.id, "   ")),
    ).toMatchObject({
      status: StatusCodes.BAD_REQUEST,
      code: "VOID_REASON_REQUIRED",
      details: { field: "reason" },
    });
    expect(
      (await failure(await voidEntry(company.cookie, entry.id, ""))).code,
    ).toBe("VALIDATION_ERROR");
    const voided = await json<Voided>(
      await voidEntry(company.cookie, entry.id, "Came yesterday"),
    );
    expect(voided.day).toBeNull();
    expect(voided.person.state.status).toBe("none");
  });

  it("applies the back-dated guard to voiding a Labour's old entry; today's still voids, and the Owner passes", async () => {
    const company = await ownerWithCompany();
    const f = await fixtures(company);
    await prisma.constructionOrganizationBackdatedEntryPolicy.create({
      data: {
        id: newId(),
        workspaceId: company.workspaceId,
        createDays: 2,
        createOverrideRoleIds: [],
        editDays: 2,
        editOverrideRoleIds: [],
        modules: {},
        createdBy: company.userId,
        updatedBy: company.userId,
      },
    });
    const clerk = await member(
      company,
      { "labour.attendance": ["read", "create", "update", "delete"] },
      [f.tower],
    );
    // An entry of five days ago, and the day and wage it made.
    const old = addDays(TODAY, -5);
    const clock = { now: at(old, "09:00") };
    const past = await handlersAt(clock).record({
      workspaceId: company.workspaceId,
      userId: company.userId,
      projectId: f.tower,
      kind: "employee",
      personId: f.dhuresh,
      action: "check_in",
      photo: PHOTO,
    });
    expect(past.entry.date).toBe(old);
    expect(await ledgerSum(f.dhuresh)).toBe(DAILY);

    expect(
      await failure(await voidEntry(clerk.cookie, past.entry.id, "Wrong")),
    ).toMatchObject({
      status: StatusCodes.FORBIDDEN,
      code: "BACKDATED_EDIT_BLOCKED",
    });
    // Refused before anything was written: the entry, the day and the wage stand.
    expect(await liveDays(f.dhuresh)).toHaveLength(1);
    expect(await ledgerSum(f.dhuresh)).toBe(DAILY);

    // A Vendor's entry changes no day, so its age does not matter.
    const gang = await handlersAt(clock).record({
      workspaceId: company.workspaceId,
      userId: company.userId,
      projectId: f.tower,
      kind: "vendor",
      personId: f.vendor,
      action: "check_in",
      photo: PHOTO,
    });
    expect(
      (await voidEntry(clerk.cookie, gang.entry.id, "Came the day after"))
        .status,
    ).toBe(StatusCodes.OK);

    // Today is inside the window.
    const anbu = await f.labour("Anbu Selvan");
    const today = (
      await recorded(
        clerk.cookie,
        entryBody(f, { kind: "employee", personId: anbu }),
      )
    ).entry;
    expect(
      (await voidEntry(clerk.cookie, today.id, "Wrong person")).status,
    ).toBe(StatusCodes.OK);

    // The Owner is never held by the policy.
    const voided = await json<Voided>(
      await voidEntry(company.cookie, past.entry.id, "Wrong person"),
    );
    expect(voided.day).toMatchObject({ effect: "cleared" });
    expect(await ledgerSum(f.dhuresh)).toBe(0);
  });

  it("needs Attendance Update as well to void a Labour's entry, since it changes their day", async () => {
    const company = await ownerWithCompany();
    const f = await fixtures(company);
    const remover = await member(
      company,
      { "labour.attendance": ["read", "create", "delete"] },
      [f.tower],
    );
    const labour = (await recorded(company.cookie, entryBody(f))).entry;
    expect(
      await failure(await voidEntry(remover.cookie, labour.id, "Wrong")),
    ).toMatchObject({
      status: StatusCodes.FORBIDDEN,
      code: "PERMISSION_DENIED",
    });
    expect(await liveDays(f.dhuresh)).toHaveLength(1);
    const gang = (
      await recorded(
        company.cookie,
        entryBody(f, { kind: "vendor", personId: f.vendor }),
      )
    ).entry;
    expect(
      (await voidEntry(remover.cookie, gang.id, "Wrong gang")).status,
    ).toBe(StatusCodes.OK);
  });

  it("needs Attendance Delete on the entry's Project, and hides another Company's entry", async () => {
    const company = await ownerWithCompany();
    const f = await fixtures(company);
    const entry = (await recorded(company.cookie, entryBody(f))).entry;
    const creator = await member(
      company,
      { "labour.attendance": ["read", "create"] },
      [f.tower],
    );
    expect(
      await failure(await voidEntry(creator.cookie, entry.id, "Wrong")),
    ).toMatchObject({
      status: StatusCodes.FORBIDDEN,
      code: "PERMISSION_DENIED",
    });
    const offProject = await member(
      company,
      { "labour.attendance": ["read", "create", "delete"] },
      [f.villa],
    );
    expect(
      (await failure(await voidEntry(offProject.cookie, entry.id, "Wrong")))
        .status,
    ).toBe(StatusCodes.FORBIDDEN);
    const other = await ownerWithCompany("Other Builders");
    expect(
      await failure(await voidEntry(other.cookie, entry.id, "Wrong")),
    ).toMatchObject({
      status: StatusCodes.NOT_FOUND,
      code: "CHECK_IN_NOT_FOUND",
    });
    const voider = await member(
      company,
      { "labour.attendance": ["read", "update", "delete"] },
      [f.tower],
    );
    const voided = await json<Voided>(
      await voidEntry(voider.cookie, entry.id, "Wrong"),
    );
    expect(voided.entry.voided?.by).toEqual({
      id: voider.userId,
      name: "Member",
    });
    expect(voided.day?.effect).toBe("cleared");
    expect(await ledgerSum(f.dhuresh)).toBe(0);
  });
});

describe("Check-In reads (ADR CM-0043)", () => {
  /** Records on the handlers' clock, as `who` at `time` today. */
  function recorder(company: Company, f: Fixtures, clock: { now: Date }) {
    const handlers = handlersAt(clock);
    return async (
      kind: "employee" | "vendor",
      personId: string,
      action: "check_in" | "check_out",
      when: Date,
    ) => {
      clock.now = when;
      return (
        await handlers.record({
          workspaceId: company.workspaceId,
          userId: company.userId,
          projectId: f.tower,
          kind,
          personId,
          action,
          photo: PHOTO,
        })
      ).entry;
    };
  }

  it("lists the Project's people by group and name, with where each stands today", async () => {
    const company = await ownerWithCompany();
    const f = await fixtures(company);
    await seedFence(company.workspaceId, f.tower);
    const anbu = await f.labour("Anbu Selvan");
    const resting = await f.labour("Arul");
    await prisma.constructionLabourEmployee.update({
      where: { id: resting },
      data: { isActive: false },
    });
    await f.labour("Murugan", [f.villa]);
    await seedVendor(company.workspaceId, "Idle Gang", [f.tower], {
      inactive: true,
    });
    await seedVendor(company.workspaceId, "Villa Gang", [f.villa]);
    await seedSiteEngineer(company.workspaceId, "Kumar", [f.tower], {
      inactive: true,
    });
    await seedSiteEngineer(company.workspaceId, "Ravi", [f.villa]);
    const arjun = await seedSiteEngineer(company.workspaceId, "Arjun", [
      f.tower,
    ]);
    await prisma.constructionLabourEmployee.update({
      where: { id: f.dhuresh },
      data: {
        photoKey: `companies/${company.workspaceId}/labour-photos/x.png`,
      },
    });

    const clock = { now: at(TODAY, "08:00") };
    const record = recorder(company, f, clock);
    await record("employee", f.dhuresh, "check_in", at(TODAY, "09:00"));
    await record("vendor", f.vendor, "check_in", at(TODAY, "08:00"));
    await record("vendor", f.vendor, "check_out", at(TODAY, "09:30"));
    const voided = await record(
      "employee",
      f.engineer,
      "check_in",
      at(TODAY, "08:30"),
    );
    await voidEntry(company.cookie, voided.id, "Wrong person");
    // Yesterday's Check Out reads as nothing today.
    await record("employee", arjun, "check_in", at(YESTERDAY, "09:00"));
    await record("employee", arjun, "check_out", at(YESTERDAY, "17:00"));

    clock.now = at(TODAY, "10:00");
    const people = await handlersAt(clock).people(
      company.workspaceId,
      f.tower,
      { canCheckIn: true, canVoid: false, canVoidEmployee: false },
    );
    expect(people).toMatchObject({
      now: at(TODAY, "10:00"),
      timeZone: "Asia/Kolkata",
      today: TODAY,
      siteFence: { name: "Tower A site" },
      canCheckIn: true,
      canVoid: false,
    });
    // Every active Employee on the Project, whatever their Role.
    expect(people.employees.map((person) => person.name)).toEqual([
      "Anbu Selvan",
      "Arjun",
      "Dhuresh Nawin",
      "Sundar",
    ]);
    expect(people).not.toHaveProperty("siteEngineers");
    expect(people.employees[2]).toMatchObject({
      kind: "employee",
      id: f.dhuresh,
      role: "Labour",
      hasPhoto: true,
      state: { status: "in", since: at(TODAY, "09:00") },
      entriesToday: 1,
    });
    expect(people.employees[0]).toMatchObject({
      id: anbu,
      hasPhoto: false,
      state: { status: "none", since: null },
      entriesToday: 0,
    });
    expect(people.vendors).toEqual([
      {
        kind: "vendor",
        id: f.vendor,
        name: "Selvam Gang",
        role: "Vendor",
        code: null,
        phone: "+919876500022",
        hasPhoto: false,
        state: { status: "out", since: at(TODAY, "09:30") },
        entriesToday: 2,
      },
    ]);
    expect(people.employees[1]).toMatchObject({
      role: "Site Engineer",
      phone: "+919876500011",
      state: { status: "none" },
      entriesToday: 0,
    });
    expect(people.employees[1]?.code).toMatch(/^SE-/);
    // A voided entry does not count.
    expect(people.employees[3]).toMatchObject({
      state: { status: "none", since: null },
      entriesToday: 0,
    });

    // Through the route, with what the member may do.
    const reader = await member(company, { "labour.attendance": ["read"] }, [
      f.tower,
    ]);
    const response = await listPeople(
      jsonRequest(`${BASE}/people?projectId=${f.tower}`, reader.cookie),
    );
    expect(response.status).toBe(StatusCodes.OK);
    const body = await json<PeoplePage>(response);
    expect(body).toMatchObject({
      timeZone: "Asia/Kolkata",
      today: TODAY,
      siteFence: { name: "Tower A site" },
      canCheckIn: false,
      canVoid: false,
    });
    expect(body.employees).toHaveLength(4);
    expect(body.employees[2]?.state.since).toBe(
      at(TODAY, "09:00").toISOString(),
    );
    const owner = await json<PeoplePage>(
      await listPeople(
        jsonRequest(`${BASE}/people?projectId=${f.tower}`, company.cookie),
      ),
    );
    expect(owner).toMatchObject({
      canCheckIn: true,
      canVoid: true,
      canVoidEmployee: true,
    });
    const offProject = await member(
      company,
      { "labour.attendance": ["read", "create"] },
      [f.villa],
    );
    expect(
      (
        await listPeople(
          jsonRequest(`${BASE}/people?projectId=${f.tower}`, offProject.cookie),
        )
      ).status,
    ).toBe(StatusCodes.FORBIDDEN);
  });

  it("opens one person with today's entries and a night shift still open from yesterday", async () => {
    const company = await ownerWithCompany();
    const f = await fixtures(company);
    const clock = { now: at(YESTERDAY, "22:00") };
    const record = recorder(company, f, clock);
    const night = await record(
      "employee",
      f.dhuresh,
      "check_in",
      at(YESTERDAY, "22:00"),
    );
    clock.now = at(TODAY, "02:00");
    const page = await handlersAt(clock).capture(
      company.workspaceId,
      f.tower,
      "employee",
      f.dhuresh,
      { canCheckIn: true, canVoid: true, canVoidEmployee: true },
    );
    expect(page.person).toMatchObject({
      name: "Dhuresh Nawin",
      state: { status: "in", since: at(YESTERDAY, "22:00") },
      // The open entry belongs to yesterday's attendance day.
      entriesToday: 0,
    });
    expect(page.entries.map((entry) => [entry.id, entry.date])).toEqual([
      [night.id, YESTERDAY],
    ]);

    const morning = await record(
      "vendor",
      f.vendor,
      "check_in",
      at(TODAY, "08:00"),
    );
    const wrong = await record(
      "vendor",
      f.vendor,
      "check_out",
      at(TODAY, "09:00"),
    );
    await voidEntry(company.cookie, wrong.id, "Pressed by mistake");
    const response = await getPerson(
      jsonRequest(
        `${BASE}/person?projectId=${f.tower}&kind=vendor&personId=${f.vendor}`,
        company.cookie,
      ),
    );
    expect(response.status).toBe(StatusCodes.OK);
    const vendor = await json<PersonPage>(response);
    expect(vendor.person).toMatchObject({ kind: "vendor", entriesToday: 1 });
    expect(
      vendor.entries.map((entry) => [entry.id, entry.voided?.reason ?? null]),
    ).toEqual([
      [morning.id, null],
      [wrong.id, "Pressed by mistake"],
    ]);
    expect(vendor.entries[1]?.voided?.by).toEqual({
      id: company.userId,
      name: expect.any(String) as string,
    });

    // The same refusals as recording.
    const resting = await f.labour("Anbu");
    await prisma.constructionLabourEmployee.update({
      where: { id: resting },
      data: { isActive: false },
    });
    const elsewhere = await f.labour("Murugan", [f.villa]);
    for (const [kind, personId, code] of [
      ["employee", resting, "EMPLOYEE_INACTIVE"],
      ["employee", elsewhere, "EMPLOYEE_NOT_ON_PROJECT"],
      ["employee", newId(), "EMPLOYEE_NOT_FOUND"],
    ] as const)
      expect(
        (
          await failure(
            await getPerson(
              jsonRequest(
                `${BASE}/person?projectId=${f.tower}&kind=${kind}&personId=${personId}`,
                company.cookie,
              ),
            ),
          )
        ).code,
      ).toBe(code);
  });

  it("lists a day's log newest first, by kind and name, a page at a time", async () => {
    const company = await ownerWithCompany();
    const f = await fixtures(company);
    const clock = { now: at(TODAY, "08:00") };
    const record = recorder(company, f, clock);
    const yesterday = await record(
      "vendor",
      f.vendor,
      "check_in",
      at(YESTERDAY, "08:00"),
    );
    await record("vendor", f.vendor, "check_out", at(YESTERDAY, "18:00"));
    const a = await record(
      "employee",
      f.dhuresh,
      "check_in",
      at(TODAY, "08:00"),
    );
    const b = await record("vendor", f.vendor, "check_in", at(TODAY, "08:10"));
    const c = await record(
      "employee",
      f.engineer,
      "check_in",
      at(TODAY, "08:20"),
    );
    const d = await record(
      "employee",
      f.dhuresh,
      "check_out",
      at(TODAY, "12:00"),
    );
    await voidEntry(company.cookie, d.id, "Too early");
    const e = await record("vendor", f.vendor, "check_out", at(TODAY, "17:00"));

    const page = (query: string, cookie = company.cookie) =>
      listEntries(jsonRequest(`${BASE}?projectId=${f.tower}&${query}`, cookie));
    const first = await json<LogPage>(await page(`date=${TODAY}&limit=2`));
    expect(first.date).toBe(TODAY);
    expect(first.total).toBe(5);
    expect(first.items.map((item) => item.id)).toEqual([e.id, d.id]);
    expect(first.items[1]?.voided?.reason).toBe("Too early");
    expect(first.prevCursor).toBeNull();
    expect(first.nextCursor).not.toBeNull();
    const second = await json<LogPage>(
      await page(`date=${TODAY}&limit=2&after=${first.nextCursor ?? ""}`),
    );
    expect(second.items.map((item) => item.id)).toEqual([c.id, b.id]);
    const third = await json<LogPage>(
      await page(`date=${TODAY}&limit=2&after=${second.nextCursor ?? ""}`),
    );
    expect(third.items.map((item) => item.id)).toEqual([a.id]);
    expect(third.nextCursor).toBeNull();
    const back = await json<LogPage>(
      await page(`date=${TODAY}&limit=2&before=${third.prevCursor ?? ""}`),
    );
    expect(back.items.map((item) => item.id)).toEqual([c.id, b.id]);

    const vendors = await json<LogPage>(
      await page(`date=${TODAY}&kind=vendor`),
    );
    expect(vendors.items.map((item) => item.id)).toEqual([e.id, b.id]);
    expect(vendors.total).toBe(2);
    const named = await json<LogPage>(await page(`date=${TODAY}&q=DHUR`));
    expect(named.items.map((item) => item.id)).toEqual([d.id, a.id]);
    expect(named.items[0]).toMatchObject({
      personName: "Dhuresh Nawin",
      recordedBy: { id: company.userId },
    });
    const engineer = await json<LogPage>(await page(`date=${TODAY}&q=sund`));
    expect(engineer.items.map((item) => item.id)).toEqual([c.id]);
    const nobody = await json<LogPage>(await page(`date=${TODAY}&q=zzz`));
    expect(nobody).toMatchObject({ items: [], total: 0, nextCursor: null });
    const earlier = await json<LogPage>(await page(`date=${YESTERDAY}`));
    expect(earlier.items.map((item) => item.id)).toHaveLength(2);
    expect(earlier.items.at(-1)?.id).toBe(yesterday.id);
    expect((await failure(await page(`date=${addDays(TODAY, 2)}`))).code).toBe(
      "DATE_IN_FUTURE",
    );

    const offProject = await member(
      company,
      { "labour.attendance": ["read"] },
      [f.villa],
    );
    expect((await page(`date=${TODAY}`, offProject.cookie)).status).toBe(
      StatusCodes.FORBIDDEN,
    );
  });

  it("serves an entry's photo and a person's record photo privately", async () => {
    const company = await ownerWithCompany();
    const f = await fixtures(company);
    const photo = pngBytes(2048);
    const entry = (
      await recorded(
        company.cookie,
        entryBody(f, { photo: Buffer.from(photo).toString("base64") }),
      )
    ).entry;
    const get = (id: string, cookie = company.cookie) =>
      getEntryPhoto(jsonRequest(`${BASE}/${id}/photo`, cookie), {
        params: Promise.resolve({ id }),
      });
    const served = await get(entry.id);
    expect(served.status).toBe(StatusCodes.OK);
    expect(served.headers.get("content-type")).toBe("image/png");
    expect(served.headers.get("cache-control")).toMatch(/^private/);
    expect(await bytesOf(served)).toEqual(photo);

    const offProject = await member(
      company,
      { "labour.attendance": ["read"] },
      [f.villa],
    );
    expect((await get(entry.id, offProject.cookie)).status).toBe(
      StatusCodes.FORBIDDEN,
    );
    const other = await ownerWithCompany("Other Builders");
    expect((await failure(await get(entry.id, other.cookie))).code).toBe(
      "CHECK_IN_NOT_FOUND",
    );
    await prisma.constructionLabourCheckInEvent.update({
      where: { id: entry.id },
      data: { photoKey: null, photoRemovedAt: new Date() },
    });
    expect(await failure(await get(entry.id))).toMatchObject({
      status: StatusCodes.NOT_FOUND,
      code: "PHOTO_NOT_FOUND",
    });

    // A record photo, as the Employees page stores it.
    const key = `companies/${company.workspaceId}/labour-photos/${newId()}.png`;
    await objectStorage().put(key, photo, "image/png");
    await prisma.constructionLabourEmployee.update({
      where: { id: f.dhuresh },
      data: { photoKey: key },
    });
    const elsewhere = await f.labour("Murugan", [f.villa]);
    await prisma.constructionLabourEmployee.update({
      where: { id: elsewhere },
      data: { photoKey: key },
    });
    const recordPhoto = (
      kind: string,
      personId: string,
      cookie = company.cookie,
    ) =>
      getRecordPhoto(
        jsonRequest(
          `${BASE}/people/${kind}/${personId}/photo?projectId=${f.tower}`,
          cookie,
        ),
        { params: Promise.resolve({ kind, personId }) },
      );
    const labour = await recordPhoto("employee", f.dhuresh);
    expect(labour.status).toBe(StatusCodes.OK);
    expect(labour.headers.get("cache-control")).toMatch(/^private/);
    expect(await bytesOf(labour)).toEqual(photo);
    for (const [kind, personId] of [
      ["vendor", f.vendor],
      // On the Project, but no record photo.
      ["employee", f.engineer],
      ["employee", elsewhere],
    ] as const)
      expect(await failure(await recordPhoto(kind, personId))).toMatchObject({
        status: StatusCodes.NOT_FOUND,
        code: "PHOTO_NOT_FOUND",
      });
    expect(
      (await recordPhoto("employee", f.dhuresh, offProject.cookie)).status,
    ).toBe(StatusCodes.FORBIDDEN);
  });
});

describe("Check-In in the OpenAPI document", () => {
  it("lists every route", async () => {
    const document = await json<{ paths: Record<string, unknown> }>(
      getOpenApi(),
    );
    for (const path of [
      "/api/construction/labour/attendance/check-ins",
      "/api/construction/labour/attendance/check-ins/people",
      "/api/construction/labour/attendance/check-ins/person",
      "/api/construction/labour/attendance/check-ins/{id}/void",
      "/api/construction/labour/attendance/check-ins/{id}/photo",
      "/api/construction/labour/attendance/check-ins/people/{kind}/{personId}/photo",
    ])
      expect(document.paths).toHaveProperty([path]);
  });
});
