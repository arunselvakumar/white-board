import { randomUUID } from "node:crypto";

import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it } from "vitest";

import { POST as approveRoute } from "@/app/api/construction/hrms/attendance/approvals/[id]/approve/route";
import { POST as rejectRoute } from "@/app/api/construction/hrms/attendance/approvals/[id]/reject/route";
import { POST as checkInRoute } from "@/app/api/construction/hrms/attendance/check-in/route";
import { POST as manualRoute } from "@/app/api/construction/hrms/attendance/manual/route";
import type { ConstructionPersonAttendanceResponseModel } from "@/app/api/_lib/person-attendance-models";
import { isoWeekday } from "@/src/hrms/domain/calendar";
import { instantAt } from "@/src/hrms/domain/company-time";
import {
  addDays,
  calendarDateToDb,
  todayIn,
} from "@/src/shared-kernel/calendar-date";
import {
  addProject,
  jsonRequest,
  memberWith,
  ownerWithCompany,
} from "@/test/companies";
import { TEST_ORIGIN } from "@/test/sessions";

import { GET as getAttendance } from "./route";

const MEMBERS = `${TEST_ORIGIN}/api/construction/organization/team-members`;
const HRMS = `${TEST_ORIGIN}/api/construction/hrms/attendance`;
const IST = "Asia/Kolkata";
const TODAY = todayIn(IST);
const day = (offset: number) => addDays(TODAY, offset);
const NO_FENCE = "00000000-0000-0000-0000-000000000000";
const OFFICE = { latitude: 13.0827, longitude: 80.2707 };

type Company = Awaited<ReturnType<typeof ownerWithCompany>>;
type Page = ConstructionPersonAttendanceResponseModel;
type Entry = { id: string; updatedAt: string; approvalStatus: string };

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

function read(cookie: string, memberId: string, query = "") {
  return getAttendance(
    jsonRequest(`${MEMBERS}/${memberId}/attendance${query}`, cookie),
    params(memberId),
  );
}

async function page(cookie: string, memberId: string, query = "") {
  const response = await read(cookie, memberId, query);
  if (response.status !== 200)
    throw new Error(`attendance: ${await response.text()}`);
  return (await response.json()) as Page;
}

function days(result: Page) {
  return result.months.flatMap((month) => month.days);
}

function on(result: Page, date: string) {
  return days(result).find((d) => d.date === date);
}

async function ok<T>(pending: Promise<Response>, what: string): Promise<T> {
  const response = await pending;
  if (!response.ok) throw new Error(`${what}: ${await response.text()}`);
  return (await response.json()) as T;
}

/** A back-dated day through Add Backdated Attendance: it waits for approval. */
function manual(cookie: string, date: string, from: string, to: string) {
  return ok<Entry>(
    manualRoute(
      jsonRequest(`${HRMS}/manual`, cookie, {
        date,
        checkInTime: from,
        checkOutTime: to,
        reason: "Was at the client's office",
      }),
    ),
    "manual",
  );
}

/** An entry written straight to the table, checked in at a branch. */
async function seedEntry(
  company: Company,
  memberId: string,
  date: string,
  from: string,
  to: string,
  branchId: string | null,
) {
  await prisma.constructionHrmsAttendanceEntry.create({
    data: {
      id: randomUUID(),
      workspaceId: company.workspaceId,
      memberId,
      attendanceDate: calendarDateToDb(date),
      checkInAt: instantAt(date, from, IST),
      checkOutAt: instantAt(date, to, IST),
      checkInBranchId: branchId,
      source: "check_in",
      approvalStatus: "none",
      createdBy: "seed",
      updatedBy: "seed",
    },
  });
}

async function branch(
  company: Company,
  name: string,
  projectId: string | null,
): Promise<string> {
  const id = randomUUID();
  await prisma.constructionHrmsBranch.create({
    data: {
      id,
      workspaceId: company.workspaceId,
      kind: projectId == null ? "office_branch" : "project_site",
      name,
      projectId,
      latitude: projectId == null ? OFFICE.latitude : 12.9716,
      longitude: projectId == null ? OFFICE.longitude : 77.5946,
      radiusMetres: 100,
      createdBy: company.userId,
      updatedBy: company.userId,
    },
  });
  return id;
}

/**
 * Prabhu, Office Staff added 40 days ago, with GPS off and every weekday
 * a working day but the one two days ago (a week off), 8 working hours:
 *
 * - three days ago, 09:00–13:00 at Chennai HO, 13:30–19:00 at the Sky
 *   Towers site and 19:00–19:30 matching no fence (10 h: 2 h overtime);
 * - four days ago, a back-dated day awaiting approval;
 * - five days ago, a back-dated day 10:00–19:00, approved;
 * - six days ago, a back-dated day, rejected;
 * - today, checked in at Chennai HO and not out yet.
 */
async function history(company: Company) {
  const weekOff = isoWeekday(day(-2));
  const workingDays = [1, 2, 3, 4, 5, 6, 7].filter((d) => d !== weekOff);
  await prisma.constructionHrmsSettings.upsert({
    where: { workspaceId: company.workspaceId },
    create: {
      id: randomUUID(),
      workspaceId: company.workspaceId,
      gpsRequirement: "disabled",
      workingDays,
      createdBy: company.userId,
      updatedBy: company.userId,
    },
    update: { gpsRequirement: "disabled", workingDays },
  });
  // Back-dated days up to a month old.
  await prisma.constructionOrganizationBackdatedEntryPolicy.upsert({
    where: { workspaceId: company.workspaceId },
    create: {
      id: randomUUID(),
      workspaceId: company.workspaceId,
      createDays: 30,
      createOverrideRoleIds: [],
      editDays: 30,
      editOverrideRoleIds: [],
      modules: {},
      createdBy: company.userId,
      updatedBy: company.userId,
    },
    update: { createDays: 30, modules: {} },
  });
  const sky = await addProject(
    company.workspaceId,
    company.userId,
    "Sky Towers",
  );
  const office = await branch(company, "Chennai HO", null);
  const site = await branch(company, "Sky Towers gate", sky);
  const worker = await memberWith(company, {
    "hrms.attendance": ["create", "read"],
  });
  const added = instantAt(day(-40), "10:00", IST);
  await prisma.constructionOrganizationTeamMember.update({
    where: { id: worker.memberId },
    data: { createdAt: added, joinedAt: instantAt(day(-39), "10:00", IST) },
  });

  await seedEntry(company, worker.memberId, day(-3), "09:00", "13:00", office);
  await seedEntry(company, worker.memberId, day(-3), "13:30", "19:00", site);
  await seedEntry(company, worker.memberId, day(-3), "19:00", "19:30", null);

  await manual(worker.cookie, day(-4), "09:00", "18:00");
  const approved = await manual(worker.cookie, day(-5), "10:00", "19:00");
  await ok(
    approveRoute(
      jsonRequest(`${HRMS}/approvals/${approved.id}/approve`, company.cookie, {
        expectedUpdatedAt: approved.updatedAt,
      }),
      params(approved.id),
    ),
    "approve",
  );
  const rejected = await manual(worker.cookie, day(-6), "09:00", "18:00");
  await ok(
    rejectRoute(
      jsonRequest(`${HRMS}/approvals/${rejected.id}/reject`, company.cookie, {
        expectedUpdatedAt: rejected.updatedAt,
        reason: "Not at work that day",
      }),
      params(rejected.id),
    ),
    "reject",
  );
  await ok(
    checkInRoute(
      jsonRequest(`${HRMS}/check-in`, worker.cookie, {
        ...OFFICE,
        accuracyMetres: 5,
      }),
    ),
    "check-in",
  );
  return { sky, office, memberId: worker.memberId };
}

describe("GET /api/construction/organization/team-members/{id}/attendance (ADR CM-0051)", () => {
  it("gives each day its HRMS status and the hours by branch, and the all-time figures", async () => {
    const company = await ownerWithCompany();
    const { sky, office, memberId } = await history(company);

    const result = await page(company.cookie, memberId);
    expect(result).toMatchObject({
      measure: "hours",
      recordsAbsence: true,
      timeZone: IST,
      today: TODAY,
      firstMonth: day(-40).slice(0, 7),
      earlierTo: null,
    });
    // Every day from the first to today has a status; none before or after.
    const listed = days(result).map((d) => d.date);
    expect(listed[0]).toBe(day(-40));
    expect(listed.at(-1)).toBe(TODAY);
    expect(listed).toHaveLength(41);

    expect(on(result, day(-3))).toEqual({
      date: day(-3),
      status: "present",
      workedMinutes: 600,
      overtimeMinutes: 120,
      headDays: null,
      places: [
        {
          place: {
            kind: "branch",
            id: office,
            name: "Chennai HO",
            canOpen: false,
          },
          status: null,
          checkIn: "09:00",
          checkOut: "13:00",
          workedMinutes: 240,
          overtimeMinutes: 0,
          hoursFrom: "times",
          open: false,
          pending: false,
          heads: null,
        },
        expect.objectContaining({
          place: {
            kind: "project",
            id: sky,
            name: "Sky Towers",
            canOpen: true,
          },
          checkIn: "13:30",
          checkOut: "19:00",
          workedMinutes: 330,
          overtimeMinutes: 120,
        }),
        expect.objectContaining({
          place: {
            kind: "branch",
            id: NO_FENCE,
            name: "No fence matched",
            canOpen: false,
          },
          workedMinutes: 30,
        }),
      ],
    });

    // Awaiting approval: shown, no hours, so the day is Absent.
    expect(on(result, day(-4))).toMatchObject({
      status: "absent",
      workedMinutes: 0,
      places: [
        expect.objectContaining({
          place: {
            kind: "branch",
            id: NO_FENCE,
            name: "No fence matched",
            canOpen: false,
          },
          checkIn: "09:00",
          checkOut: "18:00",
          pending: true,
          workedMinutes: 0,
        }),
      ],
    });
    expect(on(result, day(-5))).toMatchObject({
      status: "present",
      workedMinutes: 540,
      overtimeMinutes: 60,
    });
    // Rejected: left out.
    expect(on(result, day(-6))).toMatchObject({ status: "absent", places: [] });
    expect(on(result, day(-2))).toMatchObject({
      status: "week_off",
      places: [],
    });
    expect(on(result, day(-1))).toMatchObject({ status: "absent", places: [] });
    expect(on(result, TODAY)?.places).toEqual([
      expect.objectContaining({
        place: {
          kind: "branch",
          id: office,
          name: "Chennai HO",
          canOpen: false,
        },
        open: true,
        checkOut: null,
        workedMinutes: 0,
      }),
    ]);

    expect(result.allTime).toEqual({
      firstDay: day(-5),
      lastDay: day(-3),
      daysWorked: 2,
      workedMinutes: 1140,
      overtimeMinutes: 180,
      headDays: 0,
      places: 3,
    });
  });

  it("pages back a month at a time to the first month, all-time only on the first page", async () => {
    const company = await ownerWithCompany();
    const { memberId } = await history(company);
    const thisMonth = TODAY.slice(0, 7);
    const firstMonth = day(-40).slice(0, 7);

    const latest = await page(company.cookie, memberId, "?months=1");
    expect(latest.months.map((m) => m.month)).toEqual([thisMonth]);
    expect(latest.earlierTo).not.toBeNull();
    expect(latest.allTime).not.toBeNull();

    const earliest = await page(
      company.cookie,
      memberId,
      `?to=${firstMonth}&months=1`,
    );
    expect(earliest.months.map((m) => m.month)).toEqual([firstMonth]);
    expect(earliest.months[0]?.days[0]?.date).toBe(day(-40));
    expect(earliest.earlierTo).toBeNull();
    expect(earliest.allTime).toBeNull();

    const before = await page(company.cookie, memberId, "?to=2001-01");
    expect(before.months).toEqual([]);
    expect(before.earlierTo).toBeNull();
  });

  it("needs Office Staff Read and HRMS Attendance Read, a real Team Member and a real month", async () => {
    const company = await ownerWithCompany();
    const { memberId } = await history(company);

    const staffOnly = await memberWith(company, {
      "organization.team_members": ["read"],
    });
    const denied = await read(staffOnly.cookie, memberId);
    expect(denied.status).toBe(StatusCodes.FORBIDDEN);
    expect(await denied.json()).toMatchObject({
      code: "HRMS_ATTENDANCE_READ_REQUIRED",
    });

    const hrmsOnly = await memberWith(company, {
      "hrms.attendance": ["read", "view_all", "report"],
    });
    const noStaff = await read(hrmsOnly.cookie, memberId);
    expect(noStaff.status).toBe(StatusCodes.FORBIDDEN);
    expect(await noStaff.json()).toMatchObject({ code: "PERMISSION_DENIED" });

    // Both: every entry, a Project site's included, with no Project assigned.
    const both = await memberWith(company, {
      "organization.team_members": ["read"],
      "hrms.attendance": ["read"],
    });
    const seen = await page(both.cookie, memberId);
    expect(
      on(seen, day(-3))?.places.map((p) => [p.place.name, p.place.canOpen]),
    ).toEqual([
      ["Chennai HO", false],
      ["Sky Towers", false],
      ["No fence matched", false],
    ]);

    const missing = "0195f0a0-0000-7000-8000-000000000999";
    const notFound = await read(company.cookie, missing);
    expect(notFound.status).toBe(StatusCodes.NOT_FOUND);
    expect(await notFound.json()).toMatchObject({
      code: "TEAM_MEMBER_NOT_FOUND",
    });
    expect((await read(company.cookie, memberId, "?to=2026-13")).status).toBe(
      StatusCodes.BAD_REQUEST,
    );
    expect((await read(company.cookie, memberId, "?months=0")).status).toBe(
      StatusCodes.BAD_REQUEST,
    );
  });
});
