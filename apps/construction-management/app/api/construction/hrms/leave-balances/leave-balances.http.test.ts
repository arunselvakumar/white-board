import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { afterEach, describe, expect, it } from "vitest";

import { memberWith, ownerWithCompany } from "@/test/companies";

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
import { POST as deleteAssignment } from "../leave-structures/assignments/[id]/delete/route";
import {
  GET as listAssignments,
  POST as assign,
} from "../leave-structures/assignments/route";
import { POST as deleteStructure } from "../leave-structures/[id]/delete/route";
import { GET as getStructure } from "../leave-structures/[id]/route";
import { POST as updateStructure } from "../leave-structures/[id]/update/route";
import {
  GET as listStructures,
  POST as createStructure,
} from "../leave-structures/route";
import { GET as accruals } from "./accruals/route";
import { POST as accrue } from "./accrue/route";
import { GET as scheduled } from "./accrue/scheduled/route";
import { POST as adjust } from "./adjust/route";
import { POST as initializeByStructure } from "./initialize-by-structure/route";
import { POST as initialize } from "./initialize/route";
import { GET as balances } from "./route";
import { GET as team } from "./team/route";

type Row = {
  leaveTypeName: string;
  entitlement: number;
  initialised: boolean;
  opening: number;
  accrued: number;
  carriedForward: number;
  adjusted: number;
  available: number;
  lastAccrualPeriod: string | null;
};

type Balances = { memberId: string; leaveYear: string; rows: Row[] };

type Structure = {
  id: string;
  name: string;
  updatedAt: string;
  assignmentCount: number;
  lines: { leaveTypeName: string; effectiveDays: number }[];
};

function row(body: Balances, name: string): Row {
  const found = body.rows.find((item) => item.leaveTypeName === name);
  if (found == null) throw new Error(`No ${name} row`);
  return found;
}

const balancesOf = async (cookie: string, query = "") =>
  json<Balances>(await get(balances, `/leave-balances${query}`, cookie));

afterEach(() => {
  delete process.env["CRON_SECRET"];
});

describe("Leave structures and assignments HTTP (CM-311)", () => {
  it("adds, assigns, edits and refuses to delete an assigned structure", async () => {
    const owner = await ownerWithCompany();
    const casual = await leaveTypeId(owner.workspaceId, "Casual Leave");
    const sick = await leaveTypeId(owner.workspaceId, "Sick");
    const created = await post(
      createStructure,
      "/leave-structures",
      owner.cookie,
      {
        name: "Site staff",
        lines: [
          { leaveTypeId: casual, entitlementDays: 8 },
          { leaveTypeId: sick },
        ],
      },
    );
    expect(created.status).toBe(StatusCodes.CREATED);
    const structure = await json<Structure>(created);
    expect(structure.lines).toEqual([
      expect.objectContaining({
        leaveTypeName: "Casual Leave",
        effectiveDays: 8,
      }),
      expect.objectContaining({ leaveTypeName: "Sick", effectiveDays: 7 }),
    ]);

    const dup = await post(createStructure, "/leave-structures", owner.cookie, {
      name: "Site staff",
      lines: [{ leaveTypeId: casual }, { leaveTypeId: casual }],
    });
    expect(dup.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await json(dup)).toMatchObject({
      code: "LEAVE_STRUCTURE_LINE_DUPLICATE",
      details: { field: "lines" },
    });

    const memberId = await ownerMemberId(owner.workspaceId, owner.userId);
    const assigned = await post(
      assign,
      "/leave-structures/assignments",
      owner.cookie,
      {
        structureId: structure.id,
        memberIds: [memberId],
        effectiveFrom: "2026-01-01",
      },
    );
    expect(assigned.status).toBe(StatusCodes.CREATED);
    const again = await post(
      assign,
      "/leave-structures/assignments",
      owner.cookie,
      {
        structureId: structure.id,
        memberIds: [memberId],
        effectiveFrom: "2026-01-01",
      },
    );
    expect(again.status).toBe(StatusCodes.CONFLICT);
    expect(await json(again)).toMatchObject({
      code: "LEAVE_ASSIGNMENT_EXISTS",
    });

    const listed = await json<{ items: { id: string; memberName: string }[] }>(
      await get(
        listAssignments,
        `/leave-structures/assignments?memberId=${memberId}`,
        owner.cookie,
      ),
    );
    expect(listed.items).toHaveLength(1);

    const loaded = await json<Structure>(
      await getItem(
        getStructure,
        `/leave-structures/${structure.id}`,
        structure.id,
        owner.cookie,
      ),
    );
    expect(loaded.assignmentCount).toBe(1);
    const renamed = await postItem(
      updateStructure,
      `/leave-structures/${structure.id}/update`,
      structure.id,
      owner.cookie,
      {
        name: "Site staff 2026",
        lines: [{ leaveTypeId: casual, entitlementDays: 10 }],
        expectedUpdatedAt: loaded.updatedAt,
      },
    );
    expect(renamed.status).toBe(StatusCodes.OK);
    const edited = await json<Structure>(renamed);
    expect(edited.lines).toHaveLength(1);

    const inUse = await postItem(
      deleteStructure,
      `/leave-structures/${structure.id}/delete`,
      structure.id,
      owner.cookie,
      { expectedUpdatedAt: edited.updatedAt },
    );
    expect(inUse.status).toBe(StatusCodes.CONFLICT);
    expect(await json(inUse)).toMatchObject({ code: "LEAVE_STRUCTURE_IN_USE" });

    const assignmentId = listed.items[0]?.id ?? "";
    expect(
      (
        await postItem(
          deleteAssignment,
          `/leave-structures/assignments/${assignmentId}/delete`,
          assignmentId,
          owner.cookie,
        )
      ).status,
    ).toBe(StatusCodes.NO_CONTENT);
    expect(
      (
        await postItem(
          deleteStructure,
          `/leave-structures/${structure.id}/delete`,
          structure.id,
          owner.cookie,
          { expectedUpdatedAt: edited.updatedAt },
        )
      ).status,
    ).toBe(StatusCodes.NO_CONTENT);
    expect(
      (
        await json<{ items: unknown[] }>(
          await get(listStructures, "/leave-structures", owner.cookie),
        )
      ).items,
    ).toHaveLength(0);
  });
});

describe("Leave balances HTTP (CM-311)", () => {
  it("initialises from the structure, once, with upfront credit and monthly types at 0", async () => {
    const owner = await ownerWithCompany();
    const memberId = await ownerMemberId(owner.workspaceId, owner.userId);
    const casual = await leaveTypeId(owner.workspaceId, "Casual Leave");
    const privilege = await leaveTypeId(owner.workspaceId, "Privilege Leave");
    const structure = await json<Structure>(
      await post(createStructure, "/leave-structures", owner.cookie, {
        name: "Office",
        lines: [
          { leaveTypeId: casual, entitlementDays: 10 },
          { leaveTypeId: privilege },
        ],
      }),
    );
    await post(assign, "/leave-structures/assignments", owner.cookie, {
      structureId: structure.id,
      memberIds: [memberId],
      effectiveFrom: "2025-04-01",
    });

    const first = await post(
      initializeByStructure,
      "/leave-balances/initialize-by-structure",
      owner.cookie,
      { structureId: structure.id, leaveYear: "2025" },
    );
    expect(first.status).toBe(StatusCodes.OK);
    expect(await json(first)).toEqual({
      leaveYear: "2025",
      members: 1,
      initialised: 2,
      carriedForward: 0,
    });
    // Twice changes nothing.
    expect(
      await json(
        await post(initialize, "/leave-balances/initialize", owner.cookie, {
          memberIds: [memberId],
          leaveYear: "2025",
        }),
      ),
    ).toMatchObject({ initialised: 0 });

    const body = await balancesOf(owner.cookie, "?leaveYear=2025");
    expect(body.leaveYear).toBe("2025");
    expect(row(body, "Casual Leave")).toMatchObject({
      entitlement: 10,
      initialised: true,
      opening: 10,
      available: 10,
    });
    expect(row(body, "Privilege Leave")).toMatchObject({
      entitlement: 15,
      opening: 0,
      available: 0,
    });
    // Only the structure's types are listed.
    expect(body.rows.map((item) => item.leaveTypeName)).toEqual([
      "Casual Leave",
      "Privilege Leave",
    ]);
  });

  it("accrues each month once from the balance's start, capped, and carries forward", async () => {
    const owner = await ownerWithCompany();
    const memberId = await ownerMemberId(owner.workspaceId, owner.userId);
    const refused = await post(accrue, "/leave-balances/accrue", owner.cookie, {
      leaveYear: "2025",
    });
    expect(refused.status).toBe(StatusCodes.CONFLICT);
    expect(await json(refused)).toMatchObject({
      code: "LEAVE_ACCRUAL_DISABLED",
    });

    await setHrmsSettings(owner.workspaceId, {
      leaveAccrualEnabled: true,
      carryForwardEnabled: true,
      carryForwardMaxDays: "10",
    });
    // No structure: every active type at its yearly limit.
    await post(initialize, "/leave-balances/initialize", owner.cookie, {
      memberIds: [memberId],
      leaveYear: "2025",
    });
    const run = await post(accrue, "/leave-balances/accrue", owner.cookie, {
      leaveYear: "2025",
    });
    expect(run.status).toBe(StatusCodes.OK);
    // Maternity, Privilege and Sick: 12 months each.
    expect(await json(run)).toEqual({
      leaveYear: "2025",
      members: 1,
      credits: 36,
    });
    expect(
      await json(
        await post(accrue, "/leave-balances/accrue", owner.cookie, {
          leaveYear: "2025",
        }),
      ),
    ).toMatchObject({ credits: 0 });

    const year = await balancesOf(owner.cookie, "?leaveYear=2025");
    expect(row(year, "Privilege Leave")).toMatchObject({
      accrued: 15,
      available: 15,
      lastAccrualPeriod: "2025-12",
    });
    expect(row(year, "Sick").accrued).toBe(6.96);
    expect(row(year, "Maternity").accrued).toBe(182);
    expect(row(year, "Casual Leave")).toMatchObject({
      opening: 12,
      accrued: 0,
    });

    const next = await post(
      initialize,
      "/leave-balances/initialize",
      owner.cookie,
      {
        memberIds: [memberId],
        leaveYear: "2026",
      },
    );
    expect(await json(next)).toMatchObject({ carriedForward: 1 });
    const carried = await balancesOf(owner.cookie, "?leaveYear=2026");
    // min(15 unused, type cap 15, Company cap 10).
    expect(row(carried, "Privilege Leave").carriedForward).toBe(10);
    // Casual does not carry forward.
    expect(row(carried, "Casual Leave").carriedForward).toBe(0);

    const history = await json<{ items: { kind: string; days: number }[] }>(
      await get(
        accruals,
        "/leave-balances/accruals?leaveYear=2026",
        owner.cookie,
      ),
    );
    expect(history.items.map((item) => item.kind)).toContain("carry_forward");
  });

  it("credits Comp Off by adjustment with a reason, never below zero", async () => {
    const owner = await ownerWithCompany();
    const memberId = await ownerMemberId(owner.workspaceId, owner.userId);
    const compOff = await leaveTypeId(owner.workspaceId, "Compensatory Off");
    const credited = await post(
      adjust,
      "/leave-balances/adjust",
      owner.cookie,
      {
        memberId,
        leaveTypeId: compOff,
        leaveYear: "2026",
        days: 1.5,
        reason: "Worked on Sunday 4 Oct",
      },
    );
    expect(credited.status).toBe(StatusCodes.OK);
    expect(await json(credited)).toMatchObject({
      adjusted: 1.5,
      available: 1.5,
    });
    const tooMuch = await post(adjust, "/leave-balances/adjust", owner.cookie, {
      memberId,
      leaveTypeId: compOff,
      leaveYear: "2026",
      days: -2,
      reason: "Correction",
    });
    expect(tooMuch.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await json(tooMuch)).toMatchObject({
      code: "LEAVE_ADJUSTMENT_BELOW_ZERO",
      details: { field: "days" },
    });
    const noReason = await post(
      adjust,
      "/leave-balances/adjust",
      owner.cookie,
      {
        memberId,
        leaveTypeId: compOff,
        days: 1,
        reason: " ",
      },
    );
    expect(await json(noReason)).toMatchObject({
      code: "LEAVE_ADJUSTMENT_REASON_REQUIRED",
      details: { field: "reason" },
    });
    const badYear = await post(adjust, "/leave-balances/adjust", owner.cookie, {
      memberId,
      leaveTypeId: compOff,
      leaveYear: "26-27",
      days: 1,
      reason: "Worked on Sunday",
    });
    expect(await json(badYear)).toMatchObject({
      code: "LEAVE_YEAR_INVALID",
      details: { field: "leaveYear" },
    });
    const audit = await prisma.constructionOrganizationAuditEvent.count({
      where: {
        workspaceId: owner.workspaceId,
        action: "leave_balance.adjusted",
      },
    });
    expect(audit).toBe(1);
  });

  it("shows your own balances with read, others' with View All, and guards writes", async () => {
    const owner = await ownerWithCompany();
    const ownerId = await ownerMemberId(owner.workspaceId, owner.userId);
    const staff = await memberWith(owner, {
      "hrms.leaves": ["create", "read"],
    });
    const mine = await balancesOf(staff.cookie);
    expect(mine.memberId).toBe(staff.memberId);
    const other = await get(
      balances,
      `/leave-balances?memberId=${ownerId}`,
      staff.cookie,
    );
    expect(other.status).toBe(StatusCodes.FORBIDDEN);
    expect((await get(team, "/leave-balances/team", staff.cookie)).status).toBe(
      StatusCodes.FORBIDDEN,
    );
    const denied = await post(
      initialize,
      "/leave-balances/initialize",
      staff.cookie,
      {
        memberIds: [staff.memberId],
      },
    );
    expect(denied.status).toBe(StatusCodes.FORBIDDEN);
    expect(await json(denied)).toMatchObject({ code: "PERMISSION_DENIED" });

    const manager = await memberWith(owner, {
      "hrms.leaves": ["read", "view_all"],
    });
    const teamBody = await json<{ members: { memberId: string }[] }>(
      await get(team, "/leave-balances/team", manager.cookie),
    );
    expect(teamBody.members.map((item) => item.memberId)).toEqual(
      expect.arrayContaining([ownerId, staff.memberId, manager.memberId]),
    );

    // Another Company's member is not found.
    const stranger = await ownerWithCompany("Other Builders");
    const strangerId = await ownerMemberId(
      stranger.workspaceId,
      stranger.userId,
    );
    expect(
      (
        await get(
          balances,
          `/leave-balances?memberId=${strangerId}`,
          owner.cookie,
        )
      ).status,
    ).toBe(StatusCodes.NOT_FOUND);
    expect(
      (
        await post(initialize, "/leave-balances/initialize", owner.cookie, {
          memberIds: [strangerId],
        })
      ).status,
    ).toBe(StatusCodes.NOT_FOUND);
  });

  it("runs the scheduled accrual only with the cron secret", async () => {
    const request = (authorization?: string) =>
      scheduled(
        new Request(
          "http://localhost:3002/api/construction/hrms/leave-balances/accrue/scheduled",
          { headers: authorization == null ? {} : { authorization } },
        ),
      );
    expect((await request("Bearer x")).status).toBe(
      StatusCodes.SERVICE_UNAVAILABLE,
    );
    process.env["CRON_SECRET"] = "leave-cron-secret-for-tests";
    expect((await request()).status).toBe(StatusCodes.UNAUTHORIZED);
    expect((await request("Bearer wrong")).status).toBe(
      StatusCodes.UNAUTHORIZED,
    );
    const ran = await request("Bearer leave-cron-secret-for-tests");
    expect(ran.status).toBe(StatusCodes.OK);
    expect(await json(ran)).toMatchObject({
      companies: expect.any(Number) as number,
      credits: expect.any(Number) as number,
    });
  });
});
