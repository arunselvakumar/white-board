import { randomUUID } from "node:crypto";

import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it } from "vitest";

import { GET as getOpenApi } from "@/app/api/openapi.json/route";
import { instantAt } from "@/src/hrms/domain/company-time";
import {
  addDays,
  calendarDateToDb,
  todayIn,
} from "@/src/shared-kernel/calendar-date";
import { memberWith, ownerWithCompany } from "@/test/companies";
import { TEST_ORIGIN } from "@/test/sessions";

import { POST as checkInRoute } from "../attendance/check-in/route";
import { POST as holidayRoute } from "../holidays/route";
import { POST as initialize } from "../leave-balances/initialize/route";
import {
  get,
  json,
  leaveTypeId,
  ownerMemberId,
  post,
  setHrmsSettings,
} from "../leave-http-support";
import { POST as applyRoute } from "../leaves/route";
import { GET as dashboardRoute } from "./route";
import type { GetConstructionHrmsDashboardResponseModel as Dashboard } from "./dashboard-models";

const IST = "Asia/Kolkata";
const TODAY = todayIn(IST);
const YESTERDAY = addDays(TODAY, -1);

const dashboard = (cookie: string) => get(dashboardRoute, "/dashboard", cookie);

async function read(cookie: string): Promise<Dashboard> {
  const response = await dashboard(cookie);
  expect(response.status, JSON.stringify(await response.clone().json())).toBe(
    StatusCodes.OK,
  );
  return json<Dashboard>(response);
}

/**
 * A Company where every day is a working day (so the test does not depend
 * on the weekday): the Owner checked in now; a staff member without View
 * All who asked for a back-dated day yesterday and two days of Casual
 * Leave later this fortnight; a holiday in five days.
 */
async function company() {
  const owner = await ownerWithCompany();
  await setHrmsSettings(owner.workspaceId, {
    workingDays: [1, 2, 3, 4, 5, 6, 7],
  });
  const staff = await memberWith(owner, {
    "hrms.hrms": ["read"],
    "hrms.attendance": ["read", "create"],
    "hrms.leaves": ["read", "create"],
  });
  const ownerId = await ownerMemberId(owner.workspaceId, owner.userId);
  const opened = await post(
    initialize,
    "/leave-balances/initialize",
    owner.cookie,
    { memberIds: [ownerId, staff.memberId], leaveYear: TODAY.slice(0, 4) },
  );
  expect(opened.status).toBe(StatusCodes.OK);

  const checkedIn = await checkInRoute(
    new Request(`${TEST_ORIGIN}/api/construction/hrms/attendance/check-in`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: owner.cookie },
      body: "{}",
    }),
  );
  expect(checkedIn.status).toBe(StatusCodes.CREATED);

  const entryId = randomUUID();
  await prisma.constructionHrmsAttendanceEntry.create({
    data: {
      id: entryId,
      workspaceId: owner.workspaceId,
      memberId: staff.memberId,
      attendanceDate: calendarDateToDb(YESTERDAY),
      checkInAt: instantAt(YESTERDAY, "09:00", IST),
      checkOutAt: instantAt(YESTERDAY, "18:00", IST),
      source: "manual",
      approvalStatus: "pending",
      reason: "Forgot to check in at the site office",
      createdBy: staff.userId,
      updatedBy: staff.userId,
    },
  });

  const leaveFrom = addDays(TODAY, 2);
  const applied = await post(applyRoute, "/leaves", staff.cookie, {
    leaveTypeId: await leaveTypeId(owner.workspaceId, "Casual Leave"),
    fromDate: leaveFrom,
    toDate: addDays(leaveFrom, 1),
    reason: "Family function in Madurai",
  });
  expect(applied.status, JSON.stringify(await applied.clone().json())).toBe(
    StatusCodes.CREATED,
  );
  const leave = await json<{ id: string }>(applied);

  const holiday = await post(holidayRoute, "/holidays", owner.cookie, {
    name: "Company Foundation Day",
    date: addDays(TODAY, 5),
    type: "company",
    isOptional: false,
  });
  expect(holiday.status).toBe(StatusCodes.CREATED);

  return { owner, ownerId, staff, entryId, leave, leaveFrom };
}

describe("HRMS dashboard HTTP (CM-319)", () => {
  it("is 401 without a Session", async () => {
    const response = await dashboardRoute(
      new Request(`${TEST_ORIGIN}/api/construction/hrms/dashboard`),
    );
    expect(response.status).toBe(StatusCodes.UNAUTHORIZED);
  });

  it("shows the Owner the team's day, trend, approvals, leave and holidays", async () => {
    const { owner, ownerId, staff, entryId, leave, leaveFrom } =
      await company();
    const body = await read(owner.cookie);

    expect(body.today).toBe(TODAY);
    expect(body.permissions).toEqual({
      viewTeam: true,
      checkIn: true,
      applyLeave: true,
      approveAttendance: true,
      approveLeave: true,
      viewTeamLeaves: true,
      viewHolidays: true,
    });
    expect(body.team).toMatchObject({
      employees: 2,
      presentToday: 1,
      onLeave: 0,
      notCheckedIn: 1,
      breakdown: {
        present: 1,
        halfDay: 0,
        absent: 1,
        onLeave: 0,
        holiday: 0,
        weekOff: 0,
      },
    });
    const trend = body.team?.trend ?? [];
    expect(trend).toHaveLength(14);
    expect(trend[0]?.date).toBe(addDays(TODAY, -13));
    expect(trend[13]).toEqual({ date: TODAY, ...body.team?.breakdown });
    // Yesterday's back-dated day waits for approval: its hours do not count.
    expect(trend[12]).toMatchObject({ date: YESTERDAY, absent: 2 });

    expect(body.approvals).toMatchObject({
      total: 2,
      attendance: 1,
      leave: 1,
      cancellations: 0,
    });
    expect(
      body.approvals?.items.map((item) => [item.kind, item.id, item.title]),
    ).toEqual([
      ["attendance", entryId, "Back-dated day"],
      ["leave", leave.id, "Casual Leave"],
    ]);

    expect(body.teamLeaves).toMatchObject({
      total: 1,
      items: [
        {
          id: leave.id,
          memberName: "Member",
          leaveTypeName: "Casual Leave",
          fromDate: leaveFrom,
          totalDays: 2,
          status: "pending",
        },
      ],
    });
    expect(body.holidays).toEqual([
      expect.objectContaining({
        name: "Company Foundation Day",
        date: addDays(TODAY, 5),
      }),
    ]);

    expect(body.me).toMatchObject({
      memberId: ownerId,
      today: { state: "checked_in" },
      pending: { attendance: 0, leave: 0, items: [] },
    });
    expect(
      body.me?.balances?.find((row) => row.leaveTypeName === "Casual Leave"),
    ).toMatchObject({ available: 12, entitlement: 12 });
    expect(staff.memberId).not.toBe(ownerId);
  });

  it("shows a member without View All only their own day", async () => {
    const { staff, entryId, leave } = await company();
    const body = await read(staff.cookie);
    expect(body).toMatchObject({
      team: null,
      approvals: null,
      teamLeaves: null,
      holidays: null,
      permissions: {
        viewTeam: false,
        checkIn: true,
        applyLeave: true,
        approveAttendance: false,
        approveLeave: false,
      },
      me: {
        memberId: staff.memberId,
        name: "Member",
        today: { state: "not_checked_in", status: "absent" },
        pending: { attendance: 1, leave: 1 },
      },
    });
    expect(body.me?.pending.items.map((item) => item.id)).toEqual([
      entryId,
      leave.id,
    ]);
    expect(
      body.me?.balances?.find((row) => row.leaveTypeName === "Casual Leave"),
    ).toMatchObject({ available: 10, pending: 2 });
  });

  it("refuses a member without HRMS read", async () => {
    const owner = await ownerWithCompany();
    const lead = await memberWith(owner, {
      "hrms.attendance": ["read", "view_all", "approve"],
      "hrms.leaves": ["read", "view_all"],
    });
    const response = await dashboard(lead.cookie);
    expect(response.status).toBe(StatusCodes.FORBIDDEN);
    expect(await json(response)).toMatchObject({ code: "PERMISSION_DENIED" });
  });

  it("keeps another Company's people, requests and holidays out", async () => {
    await company();
    const other = await ownerWithCompany("Sri Balaji Constructions");
    const body = await read(other.cookie);
    expect(body.team).toMatchObject({ employees: 1, presentToday: 0 });
    expect(body.approvals).toEqual({
      total: 0,
      attendance: 0,
      leave: 0,
      cancellations: 0,
      items: [],
    });
    expect(body.teamLeaves).toEqual({ total: 0, items: [] });
    expect(body.holidays).toEqual([]);
    expect(body.me?.pending.items).toEqual([]);
  });

  it("is on the API docs", async () => {
    const document = await json<{ paths: Record<string, unknown> }>(
      await getOpenApi(),
    );
    expect(document.paths).toHaveProperty("/api/construction/hrms/dashboard");
  });
});
