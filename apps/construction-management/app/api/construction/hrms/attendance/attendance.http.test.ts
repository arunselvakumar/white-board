import { randomUUID } from "node:crypto";

import { prisma } from "@repo/construction-db";
import ExcelJS from "exceljs";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it } from "vitest";

import { GET as getOpenApi } from "@/app/api/openapi.json/route";
import { createHrmsPorts } from "@/src/hrms/infrastructure/create-hrms-ports";
import { instantAt } from "@/src/hrms/domain/company-time";
import type { Flag } from "@/src/shared-kernel/access";
import {
  addDays,
  calendarDateToDb,
  todayIn,
} from "@/src/shared-kernel/calendar-date";
import { jsonRequest, memberWith, ownerWithCompany } from "@/test/companies";
import { TEST_ORIGIN } from "@/test/sessions";

import { POST as approveRoute } from "./approvals/[id]/approve/route";
import { POST as rejectRoute } from "./approvals/[id]/reject/route";
import { GET as approvalsRoute } from "./approvals/route";
import { POST as checkInRoute } from "./check-in/route";
import { POST as checkOutRoute } from "./check-out/route";
import { POST as manualRoute } from "./manual/route";
import { POST as missedRoute } from "./missed-checkout/route";
import { GET as monthlyRoute } from "./monthly-summary/route";
import { GET as reportRoute } from "./report/monthly/route";
import { GET as teamMembersRoute } from "./team-members/route";
import { GET as teamTodayRoute } from "./team-today/route";
import { GET as todayRoute } from "./today/route";

const BASE = `${TEST_ORIGIN}/api/construction/hrms/attendance`;
const IST = "Asia/Kolkata";

type Entry = {
  id: string;
  memberId: string;
  date: string;
  checkInAt: string;
  checkOutAt: string | null;
  hours: number | null;
  source: string;
  approvalStatus: string;
  outOfFence: boolean;
  checkInBranchId: string | null;
  checkInLocation: { latitude: number; accuracyMetres: number | null } | null;
  checkOutLocation: { latitude: number } | null;
  reason: string | null;
  rejectionReason: string | null;
  updatedAt: string;
};

type Today = {
  today: string;
  state: string;
  gpsRequirement: string;
  fenceCount: number;
  entries: Entry[];
  openEntry: Entry | null;
  openNow: boolean;
  pending: Entry[];
  day: { status: string; workedHours: number };
  canCreate: boolean;
};

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });

const today = (cookie: string) =>
  todayRoute(jsonRequest(`${BASE}/today`, cookie));
const checkIn = (cookie: string, body: unknown = {}) =>
  checkInRoute(jsonRequest(`${BASE}/check-in`, cookie, body));
const checkOut = (cookie: string, body: unknown = {}) =>
  checkOutRoute(jsonRequest(`${BASE}/check-out`, cookie, body));
const missed = (cookie: string, body: unknown) =>
  missedRoute(jsonRequest(`${BASE}/missed-checkout`, cookie, body));
const manual = (cookie: string, body: unknown) =>
  manualRoute(jsonRequest(`${BASE}/manual`, cookie, body));
const approvals = (cookie: string) =>
  approvalsRoute(jsonRequest(`${BASE}/approvals`, cookie));
const approve = (cookie: string, id: string, body: unknown) =>
  approveRoute(
    jsonRequest(`${BASE}/approvals/${id}/approve`, cookie, body),
    params(id),
  );
const reject = (cookie: string, id: string, body: unknown) =>
  rejectRoute(
    jsonRequest(`${BASE}/approvals/${id}/reject`, cookie, body),
    params(id),
  );
const monthly = (cookie: string, month: string) =>
  monthlyRoute(jsonRequest(`${BASE}/monthly-summary?month=${month}`, cookie));

/** Today and earlier dates in the Company's zone (India). */
const TODAY = todayIn(IST);
const YESTERDAY = addDays(TODAY, -1);

const OFFICE = { latitude: 13.0827, longitude: 80.2707 };
/** About 1.1 km north of the office. */
const FAR = { latitude: 13.0927, longitude: 80.2707 };

async function setSettings(
  workspaceId: string,
  gpsRequirement: "disabled" | "record_only" | "required",
  by: string,
) {
  await prisma.constructionHrmsSettings.upsert({
    where: { workspaceId },
    create: {
      id: randomUUID(),
      workspaceId,
      gpsRequirement,
      // Every day a working day, so tests do not depend on the weekday.
      workingDays: [1, 2, 3, 4, 5, 6, 7],
      createdBy: by,
      updatedBy: by,
    },
    update: { gpsRequirement, workingDays: [1, 2, 3, 4, 5, 6, 7] },
  });
}

async function addOffice(workspaceId: string, by: string): Promise<string> {
  const id = randomUUID();
  await prisma.constructionHrmsBranch.create({
    data: {
      id,
      workspaceId,
      kind: "office_branch",
      name: "Chennai HO",
      latitude: OFFICE.latitude,
      longitude: OFFICE.longitude,
      radiusMetres: 100,
      createdBy: by,
      updatedBy: by,
    },
  });
  return id;
}

/** An entry written straight to the table (an earlier day's open check-in). */
async function seedEntry(
  workspaceId: string,
  memberId: string,
  date: string,
  from: string,
  to: string | null,
): Promise<string> {
  const id = randomUUID();
  await prisma.constructionHrmsAttendanceEntry.create({
    data: {
      id,
      workspaceId,
      memberId,
      attendanceDate: calendarDateToDb(date),
      checkInAt: instantAt(date, from, IST),
      checkOutAt: to == null ? null : instantAt(date, to, IST),
      source: "check_in",
      approvalStatus: "none",
      createdBy: "seed",
      updatedBy: "seed",
    },
  });
  return id;
}

async function ownerMemberId(workspaceId: string, userId: string) {
  const row = await prisma.constructionOrganizationTeamMember.findFirstOrThrow({
    where: { workspaceId, userId },
  });
  return row.id;
}

async function company(gps: "disabled" | "record_only" | "required") {
  const owner = await ownerWithCompany();
  await setSettings(owner.workspaceId, gps, owner.userId);
  return owner;
}

const ALL: Flag[] = [
  "create",
  "read",
  "approve",
  "reject",
  "view_all",
  "report",
  "export",
];

describe("Attendance HTTP (CM-308, CM-309)", () => {
  it("is 401 without a Session", async () => {
    expect((await todayRoute(new Request(`${BASE}/today`))).status).toBe(
      StatusCodes.UNAUTHORIZED,
    );
  });

  it("checks in and out with GPS disabled, one open entry at a time, audited", async () => {
    const owner = await company("disabled");
    const before = await json<Today>(await today(owner.cookie));
    expect(before).toMatchObject({
      today: TODAY,
      state: "not_checked_in",
      gpsRequirement: "disabled",
      openEntry: null,
      canCreate: true,
      day: { status: "absent", workedHours: 0 },
    });

    const created = await checkIn(owner.cookie);
    expect(created.status).toBe(StatusCodes.CREATED);
    const entry = await json<Entry>(created);
    expect(entry).toMatchObject({
      date: TODAY,
      source: "check_in",
      approvalStatus: "none",
      outOfFence: false,
      checkOutAt: null,
      hours: null,
    });

    const twice = await checkIn(owner.cookie);
    expect(twice.status).toBe(StatusCodes.CONFLICT);
    expect(await json(twice)).toMatchObject({
      code: "ATTENDANCE_ALREADY_OPEN",
    });

    const during = await json<Today>(await today(owner.cookie));
    expect(during).toMatchObject({ state: "checked_in", openNow: true });
    expect(during.openEntry?.id).toBe(entry.id);

    const closed = await checkOut(owner.cookie, {
      ...OFFICE,
      accuracyMetres: 8,
    });
    expect(closed.status).toBe(StatusCodes.OK);
    const out = await json<Entry>(closed);
    expect(out.checkOutAt).not.toBeNull();
    expect(out.hours).toBe(0);
    expect(out.checkOutLocation).toMatchObject({ latitude: 13.0827 });

    const after = await json<Today>(await today(owner.cookie));
    expect(after).toMatchObject({ state: "checked_out", openEntry: null });
    expect(after.entries).toHaveLength(1);

    const again = await checkOut(owner.cookie);
    expect(again.status).toBe(StatusCodes.CONFLICT);
    expect(await json(again)).toMatchObject({ code: "NO_OPEN_ATTENDANCE" });

    const actions = (
      await prisma.constructionOrganizationAuditEvent.findMany({
        where: { workspaceId: owner.workspaceId, entityId: entry.id },
        orderBy: { occurredAt: "asc" },
      })
    ).map((event) => event.action);
    expect(actions).toEqual([
      "hrms_attendance.checked_in",
      "hrms_attendance.checked_out",
    ]);
  });

  it("refuses a required check-in with no fence, outside the fence or without a location", async () => {
    const owner = await company("required");
    const none = await checkIn(owner.cookie, { ...OFFICE, accuracyMetres: 5 });
    expect(none.status).toBe(StatusCodes.CONFLICT);
    expect(await json(none)).toMatchObject({
      code: "OFFICE_LOCATION_NOT_CONFIGURED",
    });

    const office = await addOffice(owner.workspaceId, owner.userId);
    const outside = await checkIn(owner.cookie, { ...FAR, accuracyMetres: 5 });
    expect(outside.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await json(outside)).toMatchObject({
      code: "OUTSIDE_FENCE",
      details: { field: "location", nearestFence: "Chennai HO" },
    });
    const blind = await checkIn(owner.cookie, {});
    expect(await json(blind)).toMatchObject({
      code: "LOCATION_REQUIRED",
      details: { field: "location" },
    });
    const half = await checkIn(owner.cookie, { latitude: 13.08 });
    expect(await json(half)).toMatchObject({
      code: "LOCATION_INVALID",
      details: { field: "longitude" },
    });

    const inside = await checkIn(owner.cookie, {
      ...OFFICE,
      accuracyMetres: 12.5,
    });
    expect(inside.status).toBe(StatusCodes.CREATED);
    expect(await json(inside)).toMatchObject({
      approvalStatus: "none",
      outOfFence: false,
      checkInBranchId: office,
      checkInLocation: { latitude: 13.0827, accuracyMetres: 12.5 },
    });
    expect((await json<Today>(await today(owner.cookie))).fenceCount).toBe(1);
  });

  it("sends a record-only check-in outside the fence to approvals", async () => {
    const owner = await company("record_only");
    await addOffice(owner.workspaceId, owner.userId);
    const worker = await memberWith(owner, {
      "hrms.attendance": ["create", "read"],
    });
    const created = await checkIn(worker.cookie, { ...FAR, accuracyMetres: 5 });
    expect(created.status).toBe(StatusCodes.CREATED);
    const entry = await json<Entry>(created);
    expect(entry).toMatchObject({
      approvalStatus: "pending",
      outOfFence: true,
      checkInBranchId: null,
    });
    const list = await json<{
      items: { entry: Entry; member: { name: string } | null }[];
    }>(await approvals(owner.cookie));
    expect(list.items.map((item) => item.entry.id)).toEqual([entry.id]);
    expect(list.items[0]?.member?.name).toBe("Member");
    // Pending hours are not counted, but the member is checked in.
    expect(await json<Today>(await today(worker.cookie))).toMatchObject({
      state: "checked_in",
      pending: [{ id: entry.id }],
    });
  });

  it("closes an entry left open on an earlier day only with a missed checkout", async () => {
    const owner = await company("disabled");
    const memberId = await ownerMemberId(owner.workspaceId, owner.userId);
    const day = addDays(TODAY, -2);
    const id = await seedEntry(owner.workspaceId, memberId, day, "09:00", null);

    const view = await json<Today>(await today(owner.cookie));
    expect(view).toMatchObject({
      state: "not_checked_in",
      openNow: false,
      openEntry: { id, date: day },
    });
    expect(await json(await checkIn(owner.cookie))).toMatchObject({
      code: "ATTENDANCE_ALREADY_OPEN",
    });
    const out = await checkOut(owner.cookie);
    expect(out.status).toBe(StatusCodes.CONFLICT);
    expect(await json(out)).toMatchObject({
      code: "ATTENDANCE_OPEN_FROM_EARLIER_DAY",
    });

    const body = {
      entryId: id,
      checkOutDate: day,
      checkOutTime: "18:30",
      reason: "Phone died at the site",
      expectedUpdatedAt: view.openEntry?.updatedAt,
    };
    const early = await missed(owner.cookie, {
      ...body,
      checkOutTime: "08:00",
    });
    expect(early.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await json(early)).toMatchObject({
      code: "CHECK_OUT_BEFORE_CHECK_IN",
      details: { field: "checkOutTime" },
    });
    const late = await missed(owner.cookie, {
      ...body,
      checkOutDate: addDays(day, 1),
      checkOutTime: "10:00",
    });
    expect(await json(late)).toMatchObject({ code: "CHECK_OUT_TOO_LATE" });
    const noReason = await missed(owner.cookie, { ...body, reason: " " });
    expect(await json(noReason)).toMatchObject({
      code: "REASON_REQUIRED",
      details: { field: "reason" },
    });

    const added = await missed(owner.cookie, body);
    expect(added.status).toBe(StatusCodes.OK);
    const closed = await json<Entry>(added);
    expect(closed).toMatchObject({
      source: "missed_checkout",
      approvalStatus: "pending",
      hours: 9.5,
      reason: "Phone died at the site",
    });
    const stale = await missed(owner.cookie, body);
    expect(stale.status).toBe(StatusCodes.CONFLICT);

    // Today's own open entry is just checked out.
    expect((await checkIn(owner.cookie)).status).toBe(StatusCodes.CREATED);
    const open = await json<Today>(await today(owner.cookie));
    const notNeeded = await missed(owner.cookie, {
      ...body,
      entryId: open.openEntry?.id,
      checkOutDate: TODAY,
      expectedUpdatedAt: open.openEntry?.updatedAt,
    });
    expect(notNeeded.status).toBe(StatusCodes.CONFLICT);
    expect(await json(notNeeded)).toMatchObject({
      code: "MISSED_CHECKOUT_NOT_NEEDED",
    });
  });

  it("adds a back-dated day for approval: past date, Back-dated Entry policy, no overlap", async () => {
    const owner = await company("disabled");
    const worker = await memberWith(owner, {
      "hrms.attendance": ["create", "read"],
    });
    const body = {
      date: YESTERDAY,
      checkInTime: "09:00",
      checkOutTime: "18:00",
      reason: "Was at the client's office",
    };
    const added = await manual(worker.cookie, body);
    expect(added.status).toBe(StatusCodes.CREATED);
    expect(await json(added)).toMatchObject({
      date: YESTERDAY,
      source: "manual",
      approvalStatus: "pending",
      hours: 9,
    });

    const overlap = await manual(worker.cookie, {
      ...body,
      checkInTime: "17:00",
      checkOutTime: "20:00",
    });
    expect(overlap.status).toBe(StatusCodes.CONFLICT);
    expect(await json(overlap)).toMatchObject({
      code: "ATTENDANCE_OVERLAP",
      details: { field: "checkInTime" },
    });
    // Touching is fine.
    expect(
      (
        await manual(worker.cookie, {
          ...body,
          checkInTime: "18:00",
          checkOutTime: "19:00",
        })
      ).status,
    ).toBe(StatusCodes.CREATED);

    const todayEntry = await manual(worker.cookie, { ...body, date: TODAY });
    expect(todayEntry.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await json(todayEntry)).toMatchObject({
      code: "MANUAL_DATE_NOT_PAST",
      details: { field: "date" },
    });
    const badTime = await manual(worker.cookie, {
      ...body,
      checkInTime: "9 am",
    });
    expect(await json(badTime)).toMatchObject({
      details: { field: "checkInTime" },
    });
    const shape = await manual(worker.cookie, { date: YESTERDAY });
    expect(await json(shape)).toMatchObject({ code: "VALIDATION_ERROR" });

    await prisma.constructionOrganizationBackdatedEntryPolicy.upsert({
      where: { workspaceId: owner.workspaceId },
      create: {
        id: randomUUID(),
        workspaceId: owner.workspaceId,
        createDays: 2,
        createOverrideDesignationIds: [],
        editDays: 2,
        editOverrideDesignationIds: [],
        modules: {},
        createdBy: owner.userId,
        updatedBy: owner.userId,
      },
      update: { createDays: 2, modules: {} },
    });
    const old = await manual(worker.cookie, {
      ...body,
      date: addDays(TODAY, -5),
    });
    expect(old.status).toBe(StatusCodes.FORBIDDEN);
    expect(await json(old)).toMatchObject({ code: "BACKDATED_CREATE_BLOCKED" });
  });

  it("approves and rejects with optimistic concurrency, never one's own unless the Owner", async () => {
    const owner = await company("disabled");
    const worker = await memberWith(owner, {
      "hrms.attendance": ["create", "read", "approve", "reject"],
    });
    const manager = await memberWith(owner, {
      "hrms.attendance": ["read", "approve", "reject"],
    });
    const plain = await memberWith(owner, {
      "hrms.attendance": ["create", "read"],
    });
    const entry = await json<Entry>(
      await manual(worker.cookie, {
        date: YESTERDAY,
        checkInTime: "09:00",
        checkOutTime: "17:30",
        reason: "Site visit",
      }),
    );

    expect((await approvals(plain.cookie)).status).toBe(StatusCodes.FORBIDDEN);
    // A Member does not see their own; the manager does.
    expect(
      (await json<{ items: unknown[] }>(await approvals(worker.cookie))).items,
    ).toEqual([]);
    expect(
      (
        await json<{ items: { entry: Entry }[] }>(
          await approvals(manager.cookie),
        )
      ).items[0]?.entry.id,
    ).toBe(entry.id);

    const self = await approve(worker.cookie, entry.id, {
      expectedUpdatedAt: entry.updatedAt,
    });
    expect(self.status).toBe(StatusCodes.FORBIDDEN);
    expect(await json(self)).toMatchObject({
      code: "ATTENDANCE_SELF_APPROVAL",
    });
    expect(
      (
        await approve(plain.cookie, entry.id, {
          expectedUpdatedAt: entry.updatedAt,
        })
      ).status,
    ).toBe(StatusCodes.FORBIDDEN);

    const stale = await approve(manager.cookie, entry.id, {
      expectedUpdatedAt: new Date(0).toISOString(),
    });
    expect(stale.status).toBe(StatusCodes.CONFLICT);
    expect(await json(stale)).toMatchObject({ code: "ATTENDANCE_CHANGED" });

    const approved = await approve(manager.cookie, entry.id, {
      expectedUpdatedAt: entry.updatedAt,
    });
    expect(approved.status).toBe(StatusCodes.OK);
    const after = await json<Entry>(approved);
    expect(after.approvalStatus).toBe("approved");
    const twice = await approve(manager.cookie, entry.id, {
      expectedUpdatedAt: after.updatedAt,
    });
    expect(twice.status).toBe(StatusCodes.CONFLICT);
    expect(await json(twice)).toMatchObject({ code: "ATTENDANCE_NOT_PENDING" });

    // The approved hours count: 8.5 h on an 8 h Settings day is Present.
    const month = YESTERDAY.slice(0, 7);
    const mine = await json<{
      rows: { days: { date: string; status: string; workedHours: number }[] }[];
    }>(
      await monthly(
        (await memberWith(owner, { "hrms.attendance": ["read", "report"] }))
          .cookie,
        month,
      ),
    );
    expect(mine.rows).toHaveLength(1);
    const ownerView = await json<{
      rows: {
        member: { memberId: string };
        days: { date: string; status: string; workedHours: number }[];
      }[];
    }>(await monthly(owner.cookie, month));
    const workerRow = ownerView.rows.find(
      (row) => row.member.memberId === worker.memberId,
    );
    expect(workerRow?.days.find((day) => day.date === YESTERDAY)).toMatchObject(
      { status: "present", workedHours: 8.5 },
    );

    const second = await json<Entry>(
      await manual(worker.cookie, {
        date: addDays(TODAY, -2),
        checkInTime: "09:00",
        checkOutTime: "12:00",
        reason: "Morning at the bank",
      }),
    );
    const noReason = await reject(manager.cookie, second.id, {
      expectedUpdatedAt: second.updatedAt,
      reason: "",
    });
    expect(noReason.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await json(noReason)).toMatchObject({
      code: "REJECTION_REASON_REQUIRED",
      details: { field: "rejectionReason" },
    });
    const rejected = await reject(manager.cookie, second.id, {
      expectedUpdatedAt: second.updatedAt,
      reason: "No proof of the visit",
    });
    expect(rejected.status).toBe(StatusCodes.OK);
    expect(await json(rejected)).toMatchObject({
      approvalStatus: "rejected",
      rejectionReason: "No proof of the visit",
    });

    // The Owner may approve their own.
    const ownEntry = await json<Entry>(
      await manual(owner.cookie, {
        date: YESTERDAY,
        checkInTime: "10:00",
        checkOutTime: "11:00",
        reason: "Forgot to check in",
      }),
    );
    expect(
      (
        await approve(owner.cookie, ownEntry.id, {
          expectedUpdatedAt: ownEntry.updatedAt,
        })
      ).status,
    ).toBe(StatusCodes.OK);

    const actions = (
      await prisma.constructionOrganizationAuditEvent.findMany({
        where: { workspaceId: owner.workspaceId, entityId: second.id },
        orderBy: { occurredAt: "asc" },
      })
    ).map((event) => [event.action, (event.after as Entry).rejectionReason]);
    expect(actions).toEqual([
      ["hrms_attendance.manual_added", null],
      ["hrms_attendance.rejected", "No proof of the visit"],
    ]);
  });

  it("refuses changes to a month whose salary is approved", async () => {
    const owner = await company("disabled");
    const worker = await memberWith(owner, {
      "hrms.attendance": ["create", "read"],
    });
    const entry = await json<Entry>(
      await manual(worker.cookie, {
        date: YESTERDAY,
        checkInTime: "09:00",
        checkOutTime: "18:00",
        reason: "Site visit",
      }),
    );
    await prisma.constructionHrmsMonthLock.create({
      data: {
        id: randomUUID(),
        workspaceId: owner.workspaceId,
        memberId: worker.memberId,
        month: YESTERDAY.slice(0, 7),
        lockedAt: new Date(),
        lockedBy: owner.userId,
      },
    });
    const locked = await manual(worker.cookie, {
      date: YESTERDAY,
      checkInTime: "19:00",
      checkOutTime: "20:00",
      reason: "Evening call",
    });
    expect(locked.status).toBe(StatusCodes.CONFLICT);
    expect(await json(locked)).toMatchObject({ code: "MONTH_LOCKED" });
    const decision = await approve(owner.cookie, entry.id, {
      expectedUpdatedAt: entry.updatedAt,
    });
    expect(decision.status).toBe(StatusCodes.CONFLICT);
    expect(await json(decision)).toMatchObject({ code: "MONTH_LOCKED" });
  });

  it("checks the Permission Matrix flag of every route", async () => {
    const owner = await company("disabled");
    const reader = await memberWith(owner, { "hrms.attendance": ["read"] });
    const none = await memberWith(owner, { "hrms.holidays": ["read"] });
    expect((await today(none.cookie)).status).toBe(StatusCodes.FORBIDDEN);
    expect((await today(reader.cookie)).status).toBe(StatusCodes.OK);
    expect((await json<Today>(await today(reader.cookie))).canCreate).toBe(
      false,
    );
    for (const response of [
      await checkIn(reader.cookie),
      await checkOut(reader.cookie),
      await manual(reader.cookie, {
        date: YESTERDAY,
        checkInTime: "09:00",
        checkOutTime: "10:00",
        reason: "x",
      }),
      await teamTodayRoute(jsonRequest(`${BASE}/team-today`, reader.cookie)),
      await teamMembersRoute(
        jsonRequest(`${BASE}/team-members`, reader.cookie),
      ),
      await monthly(reader.cookie, TODAY.slice(0, 7)),
      await reportRoute(
        jsonRequest(
          `${BASE}/report/monthly?month=${TODAY.slice(0, 7)}`,
          reader.cookie,
        ),
      ),
    ])
      expect(response.status).toBe(StatusCodes.FORBIDDEN);
  });

  it("keeps another Company's entries out of reach (404)", async () => {
    const owner = await company("disabled");
    const entry = await json<Entry>(
      await manual(owner.cookie, {
        date: YESTERDAY,
        checkInTime: "09:00",
        checkOutTime: "18:00",
        reason: "Site visit",
      }),
    );
    const other = await company("disabled");
    const response = await approve(other.cookie, entry.id, {
      expectedUpdatedAt: entry.updatedAt,
    });
    expect(response.status).toBe(StatusCodes.NOT_FOUND);
    expect(await json(response)).toMatchObject({
      code: "ATTENDANCE_NOT_FOUND",
    });
    expect(
      (await json<{ items: unknown[] }>(await approvals(other.cookie))).items,
    ).toEqual([]);
    const missedOther = await missed(other.cookie, {
      entryId: entry.id,
      checkOutDate: YESTERDAY,
      checkOutTime: "19:00",
      reason: "Not mine",
      expectedUpdatedAt: entry.updatedAt,
    });
    expect(missedOther.status).toBe(StatusCodes.NOT_FOUND);
  });

  it("shows Team Today, the monthly summary and the Excel report", async () => {
    const owner = await company("disabled");
    const lead = await memberWith(owner, { "hrms.attendance": ALL });
    const worker = await memberWith(owner, {
      "hrms.attendance": ["create", "read"],
    });
    await checkIn(worker.cookie);
    const workerOld = await seedEntry(
      owner.workspaceId,
      worker.memberId,
      YESTERDAY,
      "09:30",
      "18:00",
    );

    const team = await json<{
      today: string;
      counts: Record<string, number>;
      items: { member: { memberId: string }; state: string }[];
    }>(await teamTodayRoute(jsonRequest(`${BASE}/team-today`, lead.cookie)));
    expect(team.today).toBe(TODAY);
    expect(team.counts).toMatchObject({
      all: 3,
      checked_in: 1,
      not_checked_in: 2,
    });
    expect(
      team.items.find((item) => item.member.memberId === worker.memberId)
        ?.state,
    ).toBe("checked_in");

    const members = await json<{ items: { memberId: string }[] }>(
      await teamMembersRoute(jsonRequest(`${BASE}/team-members`, lead.cookie)),
    );
    expect(members.items).toHaveLength(3);

    const month = YESTERDAY.slice(0, 7);
    const bad = await monthly(lead.cookie, "2026-13");
    expect(bad.status).toBe(StatusCodes.BAD_REQUEST);
    const summary = await json<{
      rows: {
        member: { memberId: string };
        days: { date: string; status: string }[];
        counts: { present: number };
      }[];
    }>(await monthly(lead.cookie, month));
    expect(summary.rows).toHaveLength(3);
    const row = summary.rows.find(
      (item) => item.member.memberId === worker.memberId,
    );
    expect(row?.days.find((day) => day.date === YESTERDAY)?.status).toBe(
      "present",
    );
    expect(row?.counts.present).toBeGreaterThanOrEqual(1);
    expect(workerOld).toBeTruthy();

    const report = await reportRoute(
      jsonRequest(`${BASE}/report/monthly?month=${month}`, lead.cookie),
    );
    expect(report.status).toBe(StatusCodes.OK);
    expect(report.headers.get("content-type")).toContain("spreadsheetml");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await report.arrayBuffer());
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      "Summary",
      "Days",
    ]);
    expect(workbook.getWorksheet("Summary")?.getRow(4).getCell(1).value).toBe(
      "Team Member",
    );

    // The salary run's port reads the same days.
    const days = await createHrmsPorts().attendanceDays.monthFor(
      owner.workspaceId,
      [worker.memberId],
      month,
    );
    expect(
      days.get(worker.memberId)?.find((day) => day.date === YESTERDAY),
    ).toMatchObject({ status: "present", workedHours: 8.5, late: false });
  });

  it("is on /api/docs", async () => {
    const document = await json<{ paths: Record<string, unknown> }>(
      getOpenApi(),
    );
    for (const path of [
      "today",
      "check-in",
      "check-out",
      "missed-checkout",
      "manual",
      "approvals",
      "approvals/{id}/approve",
      "approvals/{id}/reject",
      "team-today",
      "team-members",
      "monthly-summary",
      "report/monthly",
    ])
      expect(document.paths).toHaveProperty([
        `/api/construction/hrms/attendance/${path}`,
      ]);
  });
});
