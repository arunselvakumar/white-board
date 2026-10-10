import { randomUUID } from "node:crypto";

import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it } from "vitest";

import { GET as getOpenApi } from "@/app/api/openapi.json/route";
import { POST as deleteRotation } from "@/app/api/construction/hrms/rotation-templates/[id]/delete/route";
import { POST as createRotation } from "@/app/api/construction/hrms/rotation-templates/route";
import { POST as updateShift } from "@/app/api/construction/hrms/shift-templates/[id]/update/route";
import { POST as createShift } from "@/app/api/construction/hrms/shift-templates/route";
import { createHrmsPorts } from "@/src/hrms/infrastructure/create-hrms-ports";
import { jsonRequest, memberWith, ownerWithCompany } from "@/test/companies";
import { TEST_ORIGIN } from "@/test/sessions";

import { GET as listAssignments, POST as assignShift } from "./route";

const BASE = `${TEST_ORIGIN}/api/construction/hrms/employees/shift-assignments`;
const SHIFTS = `${TEST_ORIGIN}/api/construction/hrms/shift-templates`;
const ROTATIONS = `${TEST_ORIGIN}/api/construction/hrms/rotation-templates`;

type Assignment = {
  id: string;
  memberId: string;
  kind: string;
  templateId: string;
  templateName: string;
  effectiveFrom: string;
  effectiveTo: string | null;
};

type Listed = {
  today: string;
  items: {
    member: { memberId: string; name: string };
    current: Assignment | null;
    upcoming: Assignment | null;
    history: Assignment[];
  }[];
};

const GENERAL = {
  name: "General",
  startTime: "09:00",
  endTime: "18:00",
  workingDays: [1, 2, 3, 4, 5, 6],
  workingHours: 8,
  halfDayHours: 4,
  graceMinutes: 10,
  overtimeAllowed: true,
  isActive: true,
};

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

const assign = (cookie: string, body: unknown) =>
  assignShift(jsonRequest(BASE, cookie, body));
const list = (cookie: string, memberId?: string) =>
  listAssignments(
    jsonRequest(
      memberId == null ? BASE : `${BASE}?memberId=${memberId}`,
      cookie,
    ),
  );

async function setUp() {
  const owner = await ownerWithCompany();
  const general = await json<{ id: string; updatedAt: string }>(
    await createShift(jsonRequest(SHIFTS, owner.cookie, GENERAL)),
  );
  const night = await json<{ id: string }>(
    await createShift(
      jsonRequest(SHIFTS, owner.cookie, {
        ...GENERAL,
        name: "Night",
        startTime: "22:00",
        endTime: "06:00",
        overtimeAllowed: false,
      }),
    ),
  );
  const cycle = await json<{ id: string }>(
    await createRotation(
      jsonRequest(ROTATIONS, owner.cookie, {
        name: "Two on one off",
        type: "custom_cycle",
        daysPerCycle: 3,
        slots: [general.id, night.id, null],
        isActive: true,
      }),
    ),
  );
  const ravi = await memberWith(owner, { "hrms.attendance": ["read"] });
  const meena = await memberWith(owner, { "hrms.attendance": ["read"] });
  return { owner, general, night, cycle, ravi, meena };
}

describe("Shift assignments HTTP (CM-307)", () => {
  it("is 401 without a Session", async () => {
    expect((await listAssignments(new Request(BASE))).status).toBe(
      StatusCodes.UNAUTHORIZED,
    );
  });

  it("assigns to many until changed and closes the previous the day before", async () => {
    const { owner, general, cycle, ravi, meena } = await setUp();
    const first = await assign(owner.cookie, {
      memberIds: [ravi.memberId, meena.memberId],
      shiftTemplateId: general.id,
      effectiveFrom: "2026-09-01",
    });
    expect(first.status).toBe(StatusCodes.CREATED);
    expect((await json<{ items: Assignment[] }>(first)).items).toHaveLength(2);

    const changed = await assign(owner.cookie, {
      memberIds: [ravi.memberId],
      rotationTemplateId: cycle.id,
      effectiveFrom: "2026-10-15",
    });
    expect(changed.status).toBe(StatusCodes.CREATED);

    const listed = await json<Listed>(await list(owner.cookie, ravi.memberId));
    expect(listed.items).toHaveLength(1);
    const history = listed.items[0]?.history ?? [];
    expect(
      history.map((item) => [
        item.kind,
        item.templateName,
        item.effectiveFrom,
        item.effectiveTo,
      ]),
    ).toEqual([
      ["rotation", "Two on one off", "2026-10-15", null],
      ["shift", "General", "2026-09-01", "2026-10-14"],
    ]);

    // The resolver reads the stored history.
    const { shifts, calendar } = createHrmsPorts();
    const ws = owner.workspaceId;
    expect((await shifts.shiftFor(ws, ravi.memberId, "2026-10-14")).name).toBe(
      "General",
    );
    expect((await shifts.shiftFor(ws, ravi.memberId, "2026-10-15")).name).toBe(
      "General",
    ); // slot 0 of the cycle
    expect((await shifts.shiftFor(ws, ravi.memberId, "2026-10-16")).name).toBe(
      "Night",
    );
    expect(
      await shifts.shiftFor(ws, ravi.memberId, "2026-10-17"),
    ).toMatchObject({ name: "Week Off", isWorkingDay: false });
    expect(
      (await shifts.shiftFor(ws, ravi.memberId, "2026-08-31")).source,
    ).toBe("settings");
    const october = await shifts.shiftsForMonth(ws, ravi.memberId, "2026-10");
    expect(october.get("2026-10-03")?.isWorkingDay).toBe(true); // a Saturday on General
    expect(october.get("2026-10-04")?.isWorkingDay).toBe(false); // Sunday
    const days = await calendar.monthFor(
      ws,
      [ravi.memberId, meena.memberId],
      "2026-10",
    );
    expect(days.get(ravi.memberId)?.[16]?.kind).toBe("week_off"); // 17 Oct
    expect(days.get(meena.memberId)?.[16]?.kind).toBe("working"); // Saturday on General

    // Same day again replaces; an earlier start is refused.
    const replaced = await assign(owner.cookie, {
      memberIds: [ravi.memberId],
      shiftTemplateId: general.id,
      effectiveFrom: "2026-10-15",
    });
    expect(replaced.status).toBe(StatusCodes.CREATED);
    const after = await json<Listed>(await list(owner.cookie, ravi.memberId));
    expect(
      after.items[0]?.history.map((item) => [
        item.templateName,
        item.effectiveFrom,
        item.effectiveTo,
      ]),
    ).toEqual([
      ["General", "2026-10-15", null],
      ["General", "2026-09-01", "2026-10-14"],
    ]);
    const earlier = await assign(owner.cookie, {
      memberIds: [meena.memberId, ravi.memberId],
      rotationTemplateId: cycle.id,
      effectiveFrom: "2026-10-01",
    });
    expect(earlier.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await json(earlier)).toMatchObject({
      code: "SHIFT_ASSIGNMENT_BEFORE_LATEST",
      details: { field: "effectiveFrom", memberIds: [ravi.memberId] },
    });
    // All or nothing: Meena kept her single assignment.
    const meenas = await json<Listed>(await list(owner.cookie, meena.memberId));
    expect(meenas.items[0]?.history).toHaveLength(1);

    const audit = await prisma.constructionOrganizationAuditEvent.count({
      where: {
        workspaceId: owner.workspaceId,
        action: "hrms_shift_assignment.assigned",
      },
    });
    expect(audit).toBe(4);
  });

  it("lists every Team Member with today's assignment", async () => {
    const { owner, general, ravi } = await setUp();
    await assign(owner.cookie, {
      memberIds: [ravi.memberId],
      shiftTemplateId: general.id,
      effectiveFrom: "2020-01-01",
    });
    await assign(owner.cookie, {
      memberIds: [ravi.memberId],
      shiftTemplateId: general.id,
      effectiveFrom: "2099-01-01",
    });
    const listed = await json<Listed>(await list(owner.cookie));
    expect(listed.items.map((item) => item.member.name).sort()).toEqual([
      "Arun Selva Kumar",
      "Member",
      "Member",
    ]);
    const row = listed.items.find(
      (item) => item.member.memberId === ravi.memberId,
    );
    expect(row?.current).toMatchObject({
      effectiveFrom: "2020-01-01",
      effectiveTo: "2098-12-31",
    });
    expect(row?.upcoming).toMatchObject({ effectiveFrom: "2099-01-01" });
    const owners = listed.items.find(
      (item) => item.member.name === "Arun Selva Kumar",
    );
    expect(owners?.current).toBeNull();
  });

  it("refuses inactive templates, unknown members, bad shapes and locked months", async () => {
    const { owner, general, cycle, ravi } = await setUp();
    const off = await updateShift(
      jsonRequest(`${SHIFTS}/${general.id}/update`, owner.cookie, {
        ...GENERAL,
        isActive: false,
        expectedUpdatedAt: general.updatedAt,
      }),
      { params: Promise.resolve({ id: general.id }) },
    );
    expect(off.status).toBe(StatusCodes.OK);
    const inactive = await assign(owner.cookie, {
      memberIds: [ravi.memberId],
      shiftTemplateId: general.id,
      effectiveFrom: "2026-10-01",
    });
    expect(inactive.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await json(inactive)).toMatchObject({
      code: "SHIFT_ASSIGNMENT_TEMPLATE_INACTIVE",
      details: { field: "template" },
    });
    const both = await assign(owner.cookie, {
      memberIds: [ravi.memberId],
      shiftTemplateId: general.id,
      rotationTemplateId: cycle.id,
      effectiveFrom: "2026-10-01",
    });
    expect(await json(both)).toMatchObject({
      code: "SHIFT_ASSIGNMENT_TEMPLATE_REQUIRED",
    });
    const stranger = await assign(owner.cookie, {
      memberIds: [randomUUID()],
      rotationTemplateId: cycle.id,
      effectiveFrom: "2026-10-01",
    });
    expect(await json(stranger)).toMatchObject({
      code: "SHIFT_ASSIGNMENT_MEMBER_NOT_FOUND",
      details: { field: "memberIds" },
    });
    const shape = await assign(owner.cookie, {
      memberIds: [],
      rotationTemplateId: cycle.id,
      effectiveFrom: "1 Oct",
    });
    expect(await json(shape)).toMatchObject({ code: "VALIDATION_ERROR" });

    await prisma.constructionHrmsMonthLock.create({
      data: {
        id: randomUUID(),
        workspaceId: owner.workspaceId,
        memberId: ravi.memberId,
        month: "2026-09",
        lockedAt: new Date(),
        lockedBy: owner.userId,
      },
    });
    const locked = await assign(owner.cookie, {
      memberIds: [ravi.memberId],
      rotationTemplateId: cycle.id,
      effectiveFrom: "2026-09-20",
    });
    expect(locked.status).toBe(StatusCodes.CONFLICT);
    expect(await json(locked)).toMatchObject({ code: "MONTH_LOCKED" });

    // An assigned rotation cannot be deleted.
    await assign(owner.cookie, {
      memberIds: [ravi.memberId],
      rotationTemplateId: cycle.id,
      effectiveFrom: "2026-10-01",
    });
    const inUse = await deleteRotation(
      jsonRequest(`${ROTATIONS}/${cycle.id}/delete`, owner.cookie, {}),
      { params: Promise.resolve({ id: cycle.id }) },
    );
    expect(inUse.status).toBe(StatusCodes.CONFLICT);
    expect(await json(inUse)).toMatchObject({
      code: "ROTATION_TEMPLATE_IN_USE",
    });
  });

  it("needs hrms.shifts and keeps each Company's members to itself", async () => {
    const { owner, cycle, ravi } = await setUp();
    const reader = await memberWith(owner, { "hrms.shifts": ["read"] });
    expect((await list(reader.cookie)).status).toBe(StatusCodes.OK);
    const denied = await assign(reader.cookie, {
      memberIds: [ravi.memberId],
      rotationTemplateId: cycle.id,
      effectiveFrom: "2026-10-01",
    });
    expect(denied.status).toBe(StatusCodes.FORBIDDEN);
    expect(await json(denied)).toMatchObject({ code: "PERMISSION_DENIED" });
    expect((await list(ravi.cookie)).status).toBe(StatusCodes.FORBIDDEN);

    const other = await ownerWithCompany("Other Builders");
    const foreignMember = await assign(other.cookie, {
      memberIds: [ravi.memberId],
      rotationTemplateId: cycle.id,
      effectiveFrom: "2026-10-01",
    });
    expect(foreignMember.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await json(foreignMember)).toMatchObject({
      code: "SHIFT_ASSIGNMENT_TEMPLATE_INACTIVE",
    });
    expect(
      (await json<Listed>(await list(other.cookie))).items.map(
        (item) => item.member.name,
      ),
    ).toEqual(["Arun Selva Kumar"]);
  });

  it("is on /api/docs", async () => {
    const spec = await json<{
      paths: Record<string, Record<string, unknown>>;
    }>(getOpenApi());
    const path = "/api/construction/hrms/employees/shift-assignments";
    expect(spec.paths[path]?.["get"]).toBeDefined();
    expect(spec.paths[path]?.["post"]).toBeDefined();
  });
});
