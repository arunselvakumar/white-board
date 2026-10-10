import { randomUUID } from "node:crypto";

import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it } from "vitest";

import { createHrmsPorts } from "@/src/hrms/infrastructure/create-hrms-ports";
import { memberWith, ownerWithCompany } from "@/test/companies";

import { POST as initialize } from "../leave-balances/initialize/route";
import { GET as balances } from "../leave-balances/route";
import {
  get,
  getItem,
  json,
  leaveTypeId,
  ownerMemberId,
  post,
  postItem,
  setHrmsSettings,
} from "../leave-http-support";
import { POST as createType } from "../leave-types/route";
import { POST as approveCancellation } from "./[id]/approve-cancellation/route";
import { POST as approve } from "./[id]/approve/route";
import { POST as rejectCancellation } from "./[id]/reject-cancellation/route";
import { POST as reject } from "./[id]/reject/route";
import { POST as requestCancellation } from "./[id]/request-cancellation/route";
import { GET as getLeave } from "./[id]/route";
import { POST as withdraw } from "./[id]/withdraw/route";
import { GET as approvals } from "./approvals/route";
import { GET as options } from "./options/route";
import { POST as preview } from "./preview/route";
import { GET as teamReport } from "./report/team/route";
import { GET as myLeaves, POST as applyRoute } from "./route";
import { GET as team } from "./team/route";

type Leave = {
  id: string;
  memberId: string;
  status: string;
  totalDays: number;
  currentLevel: number;
  appliedByMemberId: string;
  days: { date: string; session: string }[];
  canWithdraw: boolean;
  canRequestCancellation: boolean;
  canDecide: boolean;
  updatedAt: string;
};

type BalanceRow = {
  leaveTypeName: string;
  used: number;
  pending: number;
  available: number;
};

const REASON = "Family function in Madurai";

/**
 * A Company with an Owner, a staff member who applies, two approvers, and
 * 2026 balances opened for all of them (Casual Leave 12 upfront).
 */
async function company() {
  const owner = await ownerWithCompany();
  const staff = await memberWith(owner, {
    "hrms.leaves": ["create", "read"],
  });
  const approver = await memberWith(owner, {
    "hrms.leaves": ["create", "read", "approve", "reject"],
  });
  const second = await memberWith(owner, {
    "hrms.leaves": ["read", "approve", "reject"],
  });
  const ownerId = await ownerMemberId(owner.workspaceId, owner.userId);
  const opened = await post(
    initialize,
    "/leave-balances/initialize",
    owner.cookie,
    {
      memberIds: [ownerId, staff.memberId, approver.memberId, second.memberId],
      leaveYear: "2026",
    },
  );
  expect(opened.status).toBe(StatusCodes.OK);
  const casual = await leaveTypeId(owner.workspaceId, "Casual Leave");
  const lossOfPay = await leaveTypeId(owner.workspaceId, "Loss of Pay");
  return { owner, ownerId, staff, approver, second, casual, lossOfPay };
}

const apply = (cookie: string, body: Record<string, unknown>) =>
  post(applyRoute, "/leaves", cookie, { reason: REASON, ...body });

async function applied(cookie: string, body: Record<string, unknown>) {
  const response = await apply(cookie, body);
  expect(response.status, JSON.stringify(await response.clone().json())).toBe(
    StatusCodes.CREATED,
  );
  return json<Leave>(response);
}

const act = (
  handler: Parameters<typeof postItem>[0],
  verb: string,
  leave: { id: string; updatedAt: string },
  cookie: string,
  body: Record<string, unknown> = {},
) =>
  postItem(handler, `/leaves/${leave.id}/${verb}`, leave.id, cookie, {
    expectedUpdatedAt: leave.updatedAt,
    ...body,
  });

async function casualBalance(cookie: string): Promise<BalanceRow> {
  const body = await json<{ rows: BalanceRow[] }>(
    await get(balances, "/leave-balances?leaveYear=2026", cookie),
  );
  const row = body.rows.find((item) => item.leaveTypeName === "Casual Leave");
  if (row == null) throw new Error("no Casual Leave balance");
  return row;
}

describe("Leave requests HTTP (CM-312, CM-313)", () => {
  it("skips the weekend, reserves on apply and uses on approval", async () => {
    const { owner, staff, approver, casual } = await company();
    const range = {
      leaveTypeId: casual,
      fromDate: "2026-11-06",
      toDate: "2026-11-09",
    };
    const shown = await json<{
      total: number;
      skipped: { kind: string }[];
      balance: { available: number };
      problem: unknown;
    }>(await post(preview, "/leaves/preview", staff.cookie, range));
    expect(shown).toMatchObject({
      total: 2,
      skipped: [{ kind: "week_off" }, { kind: "week_off" }],
      balance: { available: 12 },
      problem: null,
    });

    const leave = await applied(staff.cookie, range);
    expect(leave).toMatchObject({
      status: "pending",
      totalDays: 2,
      memberId: staff.memberId,
      canWithdraw: true,
      canDecide: false,
      days: [
        { date: "2026-11-06", session: "full" },
        { date: "2026-11-09", session: "full" },
      ],
    });
    expect(await casualBalance(staff.cookie)).toMatchObject({
      pending: 2,
      used: 0,
      available: 10,
    });

    // The applicant has no approve flag.
    expect((await act(approve, "approve", leave, staff.cookie)).status).toBe(
      StatusCodes.FORBIDDEN,
    );
    const stale = await act(approve, "approve", leave, approver.cookie, {
      expectedUpdatedAt: new Date(0).toISOString(),
    });
    expect(stale.status).toBe(StatusCodes.CONFLICT);
    expect(await json(stale)).toMatchObject({ code: "LEAVE_REQUEST_CHANGED" });

    const pending = await json<{
      items: Leave[];
      counts: Record<string, number>;
    }>(await get(approvals, "/leaves/approvals?tab=pending", approver.cookie));
    expect(pending.items.map((item) => item.id)).toEqual([leave.id]);
    expect(pending.items[0]?.canDecide).toBe(true);
    expect(pending.counts).toMatchObject({ pending: 1, approved: 0 });

    const approved = await json<Leave>(
      await act(approve, "approve", leave, approver.cookie, {
        remarks: "Enjoy",
      }),
    );
    expect(approved).toMatchObject({
      status: "approved",
      canRequestCancellation: false,
    });
    expect(await casualBalance(staff.cookie)).toMatchObject({
      pending: 0,
      used: 2,
      available: 10,
    });
    // A second decision on the same version is refused.
    expect((await act(approve, "approve", leave, approver.cookie)).status).toBe(
      StatusCodes.CONFLICT,
    );

    const mine = await json<{ items: Leave[] }>(
      await get(myLeaves, "/leaves", staff.cookie),
    );
    expect(mine.items[0]).toMatchObject({
      id: leave.id,
      status: "approved",
      canRequestCancellation: true,
    });

    // Salary reads approved leave through the LeaveDaySource port.
    const days = await createHrmsPorts().leaveDays.approvedForMonth(
      owner.workspaceId,
      [staff.memberId],
      "2026-11",
    );
    expect(days.get(staff.memberId)).toEqual([
      expect.objectContaining({ date: "2026-11-06", isPaid: true, days: 1 }),
      expect.objectContaining({ date: "2026-11-09", isPaid: true, days: 1 }),
    ]);

    const audit = await prisma.constructionOrganizationAuditEvent.findMany({
      where: { workspaceId: owner.workspaceId, entityId: leave.id },
      orderBy: { occurredAt: "asc" },
      select: { action: true },
    });
    expect(audit.map((item) => item.action)).toEqual([
      "leave_request.applied",
      "leave_request.approved",
    ]);
  });

  it("refuses short reasons, overlaps, day-off ranges and over-balance; Loss of Pay needs no balance", async () => {
    const { owner, staff, casual, lossOfPay } = await company();
    const short = await apply(staff.cookie, {
      leaveTypeId: casual,
      fromDate: "2026-11-02",
      toDate: "2026-11-02",
      reason: "Fever",
    });
    expect(short.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await json(short)).toMatchObject({
      code: "LEAVE_REASON_TOO_SHORT",
      details: { field: "reason" },
    });

    await applied(staff.cookie, {
      leaveTypeId: casual,
      fromDate: "2026-11-03",
      toDate: "2026-11-03",
      days: [{ date: "2026-11-03", session: "morning" }],
    });
    // The other half of the same day is fine; the same half is not.
    const afternoon = await applied(staff.cookie, {
      leaveTypeId: casual,
      fromDate: "2026-11-03",
      toDate: "2026-11-03",
      days: [{ date: "2026-11-03", session: "afternoon" }],
    });
    expect(afternoon.totalDays).toBe(0.5);
    const overlap = await apply(staff.cookie, {
      leaveTypeId: casual,
      fromDate: "2026-11-02",
      toDate: "2026-11-04",
    });
    expect(overlap.status).toBe(StatusCodes.CONFLICT);
    expect(await json(overlap)).toMatchObject({ code: "LEAVE_OVERLAPS" });

    const weekend = await apply(staff.cookie, {
      leaveTypeId: casual,
      fromDate: "2026-11-07",
      toDate: "2026-11-08",
    });
    expect(await json(weekend)).toMatchObject({
      code: "LEAVE_NO_WORKING_DAYS",
      details: { field: "fromDate" },
    });
    const backwards = await apply(staff.cookie, {
      leaveTypeId: casual,
      fromDate: "2026-11-10",
      toDate: "2026-11-09",
    });
    expect(await json(backwards)).toMatchObject({
      code: "LEAVE_TO_BEFORE_FROM",
      details: { field: "toDate" },
    });
    const twoYears = await apply(staff.cookie, {
      leaveTypeId: casual,
      fromDate: "2026-12-31",
      toDate: "2027-01-01",
    });
    expect(await json(twoYears)).toMatchObject({ code: "LEAVE_SPANS_YEARS" });

    // 11 left; 12 working days asked.
    const tooMany = await apply(staff.cookie, {
      leaveTypeId: casual,
      fromDate: "2026-11-16",
      toDate: "2026-12-01",
    });
    expect(tooMany.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await json(tooMany)).toMatchObject({
      code: "LEAVE_BALANCE_INSUFFICIENT",
      details: { field: "leaveTypeId", available: 11, requested: 12 },
    });
    const unpaid = await applied(staff.cookie, {
      leaveTypeId: lossOfPay,
      fromDate: "2026-11-16",
      toDate: "2026-12-01",
    });
    expect(unpaid.totalDays).toBe(12);

    // The most days in one request.
    const short2 = await json<{ id: string }>(
      await post(createType, "/leave-types", owner.cookie, {
        name: "Short Leave",
        yearlyLimit: 5,
        isPaid: true,
        requiresApproval: true,
        maxConsecutiveDays: 1,
        carryForward: false,
        accrualMode: "upfront",
        allowAdvanceUse: false,
      }),
    );
    const capped = await apply(staff.cookie, {
      leaveTypeId: short2.id,
      fromDate: "2026-12-07",
      toDate: "2026-12-08",
    });
    expect(await json(capped)).toMatchObject({
      code: "LEAVE_MAX_CONSECUTIVE_EXCEEDED",
      details: { field: "toDate" },
    });
  });

  it("rejects with a reason, withdraws a pending request and runs the cancellation flow", async () => {
    const { staff, approver, casual } = await company();
    const first = await applied(staff.cookie, {
      leaveTypeId: casual,
      fromDate: "2026-11-02",
      toDate: "2026-11-02",
    });
    const noReason = await act(reject, "reject", first, approver.cookie, {
      reason: "  ",
    });
    expect(noReason.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await json(noReason)).toMatchObject({
      code: "LEAVE_REJECTION_REASON_REQUIRED",
      details: { field: "reason" },
    });
    const rejected = await json<Leave & { rejectionReason: string }>(
      await act(reject, "reject", first, approver.cookie, {
        reason: "Month-end closing",
      }),
    );
    expect(rejected).toMatchObject({
      status: "rejected",
      rejectionReason: "Month-end closing",
    });
    expect((await casualBalance(staff.cookie)).available).toBe(12);

    const second = await applied(staff.cookie, {
      leaveTypeId: casual,
      fromDate: "2026-11-02",
      toDate: "2026-11-03",
    });
    const withdrawn = await json<Leave>(
      await act(withdraw, "withdraw", second, staff.cookie),
    );
    expect(withdrawn.status).toBe("withdrawn");
    expect(await casualBalance(staff.cookie)).toMatchObject({
      available: 12,
      pending: 0,
    });

    const third = await applied(staff.cookie, {
      leaveTypeId: casual,
      fromDate: "2026-11-04",
      toDate: "2026-11-05",
    });
    const approved = await json<Leave>(
      await act(approve, "approve", third, approver.cookie),
    );
    expect(
      (await act(withdraw, "withdraw", approved, staff.cookie)).status,
    ).toBe(StatusCodes.CONFLICT);
    const noCancelReason = await act(
      requestCancellation,
      "request-cancellation",
      approved,
      staff.cookie,
      { reason: "" },
    );
    expect(await json(noCancelReason)).toMatchObject({
      code: "LEAVE_CANCELLATION_REASON_REQUIRED",
    });
    const asked = await json<Leave>(
      await act(
        requestCancellation,
        "request-cancellation",
        approved,
        staff.cookie,
        {
          reason: "Function postponed",
        },
      ),
    );
    expect(asked.status).toBe("cancellation_requested");
    // Balance changes only once the cancellation is approved.
    expect((await casualBalance(staff.cookie)).used).toBe(2);
    const cancelTab = await json<{ items: Leave[] }>(
      await get(
        approvals,
        "/leaves/approvals?tab=cancel_requests",
        approver.cookie,
      ),
    );
    expect(cancelTab.items.map((item) => item.id)).toEqual([third.id]);

    const kept = await json<Leave>(
      await act(
        rejectCancellation,
        "reject-cancellation",
        asked,
        approver.cookie,
        {
          reason: "Already planned cover",
        },
      ),
    );
    expect(kept.status).toBe("approved");
    const askedAgain = await json<Leave>(
      await act(
        requestCancellation,
        "request-cancellation",
        kept,
        staff.cookie,
        {
          reason: "Function cancelled",
        },
      ),
    );
    const cancelled = await json<Leave>(
      await act(
        approveCancellation,
        "approve-cancellation",
        askedAgain,
        approver.cookie,
      ),
    );
    expect(cancelled.status).toBe("cancelled");
    expect(await casualBalance(staff.cookie)).toMatchObject({
      used: 0,
      available: 12,
    });
  });

  it("never lets an approver decide their own request; the Owner may", async () => {
    const { owner, approver, casual } = await company();
    const own = await applied(approver.cookie, {
      leaveTypeId: casual,
      fromDate: "2026-11-02",
      toDate: "2026-11-02",
    });
    expect(own.canDecide).toBe(false);
    const refused = await act(approve, "approve", own, approver.cookie);
    expect(refused.status).toBe(StatusCodes.FORBIDDEN);
    expect(await json(refused)).toMatchObject({ code: "LEAVE_OWN_REQUEST" });
    expect(
      (await json<Leave>(await act(approve, "approve", own, owner.cookie)))
        .status,
    ).toBe("approved");

    const ownersOwn = await applied(owner.cookie, {
      leaveTypeId: casual,
      fromDate: "2026-11-02",
      toDate: "2026-11-02",
    });
    expect(ownersOwn.canDecide).toBe(true);
    expect(
      (
        await json<Leave>(
          await act(approve, "approve", ownersOwn, owner.cookie),
        )
      ).status,
    ).toBe("approved");
  });

  it("needs two different approvers with two levels, and one wins a race", async () => {
    const { owner, staff, approver, second, casual } = await company();
    await setHrmsSettings(owner.workspaceId, { leaveApprovalLevels: 2 });
    const leave = await applied(staff.cookie, {
      leaveTypeId: casual,
      fromDate: "2026-11-02",
      toDate: "2026-11-02",
    });
    const levelOne = await json<Leave>(
      await act(approve, "approve", leave, approver.cookie),
    );
    expect(levelOne).toMatchObject({ status: "pending", currentLevel: 2 });
    const again = await act(approve, "approve", levelOne, approver.cookie);
    expect(again.status).toBe(StatusCodes.FORBIDDEN);
    expect(await json(again)).toMatchObject({
      code: "LEAVE_ALREADY_APPROVED_BY_YOU",
    });
    expect(
      (
        await json<Leave>(
          await act(approve, "approve", levelOne, second.cookie),
        )
      ).status,
    ).toBe("approved");

    // Two approvers deciding the same version at once: one wins.
    await setHrmsSettings(owner.workspaceId, { leaveApprovalLevels: 1 });
    const raced = await applied(staff.cookie, {
      leaveTypeId: casual,
      fromDate: "2026-11-03",
      toDate: "2026-11-03",
    });
    const outcomes = await Promise.all([
      act(approve, "approve", raced, approver.cookie),
      act(reject, "reject", raced, second.cookie, { reason: "Busy week" }),
    ]);
    expect(outcomes.map((item) => item.status).sort()).toEqual([
      StatusCodes.OK,
      StatusCodes.CONFLICT,
    ]);
    const final = await json<Leave>(
      await getItem(getLeave, `/leaves/${raced.id}`, raced.id, staff.cookie),
    );
    expect(["approved", "rejected"]).toContain(final.status);
    // Exactly one decision posted its entries.
    const entries = await prisma.constructionHrmsLeaveLedgerEntry.findMany({
      where: { requestId: raced.id },
      select: { kind: true },
    });
    expect(entries.map((item) => item.kind).sort()).toEqual(
      final.status === "approved"
        ? ["released", "reserved", "used"]
        : ["released", "reserved"],
    );
  });

  it("approves at once and cancels at once when the type needs no approval", async () => {
    const { owner, staff } = await company();
    const quick = await json<{ id: string }>(
      await post(createType, "/leave-types", owner.cookie, {
        name: "Birthday Leave",
        yearlyLimit: 1,
        isPaid: true,
        requiresApproval: false,
        carryForward: false,
        accrualMode: "upfront",
        allowAdvanceUse: false,
      }),
    );
    await post(initialize, "/leave-balances/initialize", owner.cookie, {
      memberIds: [staff.memberId],
      leaveYear: "2026",
    });
    const leave = await applied(staff.cookie, {
      leaveTypeId: quick.id,
      fromDate: "2026-11-02",
      toDate: "2026-11-02",
    });
    expect(leave.status).toBe("approved");
    const cancelled = await json<Leave>(
      await act(
        requestCancellation,
        "request-cancellation",
        leave,
        staff.cookie,
        {
          reason: "Changed plans",
        },
      ),
    );
    expect(cancelled.status).toBe("cancelled");
  });

  it("lets a manager with View All apply on someone's behalf, see the team and report", async () => {
    const { owner, staff, casual } = await company();
    const manager = await memberWith(owner, {
      "hrms.leaves": ["create", "read", "view_all"],
    });
    const forStaff = await applied(manager.cookie, {
      memberId: staff.memberId,
      leaveTypeId: casual,
      fromDate: "2026-11-02",
      toDate: "2026-11-02",
    });
    expect(forStaff.memberId).toBe(staff.memberId);
    expect(forStaff.appliedByMemberId).toBe(manager.memberId);
    const mine = await json<{ items: Leave[] }>(
      await get(myLeaves, "/leaves", staff.cookie),
    );
    expect(mine.items.map((item) => item.id)).toContain(forStaff.id);

    const notAllowed = await apply(staff.cookie, {
      memberId: manager.memberId,
      leaveTypeId: casual,
      fromDate: "2026-11-03",
      toDate: "2026-11-03",
    });
    expect(notAllowed.status).toBe(StatusCodes.FORBIDDEN);
    const choices = await json<{
      canApplyForOthers: boolean;
      members: unknown[];
    }>(await get(options, "/leaves/options", manager.cookie));
    expect(choices.canApplyForOthers).toBe(true);
    expect(choices.members.length).toBeGreaterThanOrEqual(4);

    const teamList = await json<{ items: Leave[] }>(
      await get(
        team,
        "/leaves/team?from=2026-11-01&to=2026-11-30",
        manager.cookie,
      ),
    );
    expect(teamList.items.map((item) => item.id)).toEqual([forStaff.id]);
    expect(
      (
        await get(
          team,
          "/leaves/team?from=2026-11-01&to=2026-11-30",
          staff.cookie,
        )
      ).status,
    ).toBe(StatusCodes.FORBIDDEN);
    expect(
      (
        await get(
          teamReport,
          "/leaves/report/team?from=2026-11-01&to=2026-11-30",
          manager.cookie,
        )
      ).status,
    ).toBe(StatusCodes.FORBIDDEN);
    const report = await json<{
      rows: { memberId: string; pendingDays: number }[];
    }>(
      await get(
        teamReport,
        "/leaves/report/team?from=2026-11-01&to=2026-11-30",
        owner.cookie,
      ),
    );
    expect(
      report.rows.find((item) => item.memberId === staff.memberId)?.pendingDays,
    ).toBe(1);
  });

  it("refuses closed months and back-dated leave beyond the policy", async () => {
    const { owner, staff, approver, casual } = await company();
    const pending = await applied(staff.cookie, {
      leaveTypeId: casual,
      fromDate: "2026-11-02",
      toDate: "2026-11-02",
    });
    await prisma.constructionHrmsMonthLock.create({
      data: {
        id: randomUUID(),
        workspaceId: owner.workspaceId,
        memberId: staff.memberId,
        month: "2026-11",
        lockedAt: new Date(),
        lockedBy: owner.userId,
      },
    });
    const locked = await apply(staff.cookie, {
      leaveTypeId: casual,
      fromDate: "2026-11-10",
      toDate: "2026-11-10",
    });
    expect(locked.status).toBe(StatusCodes.CONFLICT);
    expect(await json(locked)).toMatchObject({ code: "MONTH_LOCKED" });
    expect(
      (await act(approve, "approve", pending, approver.cookie)).status,
    ).toBe(StatusCodes.CONFLICT);

    await prisma.constructionOrganizationBackdatedEntryPolicy.create({
      data: {
        id: randomUUID(),
        workspaceId: owner.workspaceId,
        createDays: 0,
        createOverrideDesignationIds: [],
        editDays: 0,
        editOverrideDesignationIds: [],
        modules: {
          leave: {
            mode: "custom",
            create: { days: 1, overrideDesignationIds: [] },
            edit: { days: 0, overrideDesignationIds: [] },
          },
        },
        createdBy: owner.userId,
        updatedBy: owner.userId,
      },
    });
    const old = await apply(staff.cookie, {
      leaveTypeId: casual,
      fromDate: "2026-01-05",
      toDate: "2026-01-05",
    });
    expect(old.status).toBe(StatusCodes.FORBIDDEN);
    expect(await json(old)).toMatchObject({ code: "BACKDATED_CREATE_BLOCKED" });
  });

  it("keeps requests to their Company and to the people who may see them", async () => {
    const { staff, casual, owner } = await company();
    const leave = await applied(staff.cookie, {
      leaveTypeId: casual,
      fromDate: "2026-11-02",
      toDate: "2026-11-02",
    });
    const peer = await memberWith(owner, { "hrms.leaves": ["create", "read"] });
    expect(
      (await getItem(getLeave, `/leaves/${leave.id}`, leave.id, peer.cookie))
        .status,
    ).toBe(StatusCodes.NOT_FOUND);
    expect((await act(withdraw, "withdraw", leave, peer.cookie)).status).toBe(
      StatusCodes.NOT_FOUND,
    );
    const stranger = await ownerWithCompany("Other Builders");
    expect(
      (
        await getItem(
          getLeave,
          `/leaves/${leave.id}`,
          leave.id,
          stranger.cookie,
        )
      ).status,
    ).toBe(StatusCodes.NOT_FOUND);
    expect((await act(approve, "approve", leave, stranger.cookie)).status).toBe(
      StatusCodes.NOT_FOUND,
    );
    const noFlag = await memberWith(owner, { "hrms.attendance": ["read"] });
    expect((await get(myLeaves, "/leaves", noFlag.cookie)).status).toBe(
      StatusCodes.FORBIDDEN,
    );
    expect(
      (await get(approvals, "/leaves/approvals", staff.cookie)).status,
    ).toBe(StatusCodes.FORBIDDEN);
  });
});
