import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it } from "vitest";

import { GET as getOpenApi } from "@/app/api/openapi.json/route";
import { jsonRequest, memberWith, ownerWithCompany } from "@/test/companies";
import { TEST_ORIGIN } from "@/test/sessions";

import { POST as deleteRotation } from "../rotation-templates/[id]/delete/route";
import { POST as updateRotation } from "../rotation-templates/[id]/update/route";
import { GET as activeRotations } from "../rotation-templates/active/route";
import {
  GET as listRotations,
  POST as createRotation,
} from "../rotation-templates/route";
import { POST as deleteShift } from "./[id]/delete/route";
import { POST as updateShift } from "./[id]/update/route";
import { GET as activeShifts } from "./active/route";
import { GET as listShifts, POST as createShift } from "./route";

const SHIFTS = `${TEST_ORIGIN}/api/construction/hrms/shift-templates`;
const ROTATIONS = `${TEST_ORIGIN}/api/construction/hrms/rotation-templates`;

type Template = {
  id: string;
  name: string;
  isActive: boolean;
  inUse: boolean;
  updatedAt: string;
};
type Rotation = Template & {
  type: string;
  daysPerCycle: number;
  slots: (string | null)[];
};

const GENERAL = {
  name: "General",
  startTime: "09:30",
  endTime: "18:30",
  workingDays: [1, 2, 3, 4, 5, 6],
  workingHours: 8,
  halfDayHours: 4,
  graceMinutes: 10,
  overtimeAllowed: true,
  isActive: true,
};

const NIGHT = {
  ...GENERAL,
  name: "Night",
  startTime: "22:00",
  endTime: "06:00",
  workingHours: 7.5,
  overtimeAllowed: false,
};

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });

const shift = {
  create: (cookie: string, body: unknown) =>
    createShift(jsonRequest(SHIFTS, cookie, body)),
  list: (cookie: string) => listShifts(jsonRequest(SHIFTS, cookie)),
  active: (cookie: string) =>
    activeShifts(jsonRequest(`${SHIFTS}/active`, cookie)),
  update: (cookie: string, id: string, body: unknown) =>
    updateShift(
      jsonRequest(`${SHIFTS}/${id}/update`, cookie, body),
      params(id),
    ),
  delete: (cookie: string, id: string) =>
    deleteShift(jsonRequest(`${SHIFTS}/${id}/delete`, cookie, {}), params(id)),
};

const rotation = {
  create: (cookie: string, body: unknown) =>
    createRotation(jsonRequest(ROTATIONS, cookie, body)),
  list: (cookie: string) => listRotations(jsonRequest(ROTATIONS, cookie)),
  active: (cookie: string) =>
    activeRotations(jsonRequest(`${ROTATIONS}/active`, cookie)),
  update: (cookie: string, id: string, body: unknown) =>
    updateRotation(
      jsonRequest(`${ROTATIONS}/${id}/update`, cookie, body),
      params(id),
    ),
  delete: (cookie: string, id: string) =>
    deleteRotation(
      jsonRequest(`${ROTATIONS}/${id}/delete`, cookie, {}),
      params(id),
    ),
};

describe("Shift and rotation templates HTTP (CM-306)", () => {
  it("is 401 without a Session", async () => {
    expect((await listShifts(new Request(SHIFTS))).status).toBe(
      StatusCodes.UNAUTHORIZED,
    );
    expect((await listRotations(new Request(ROTATIONS))).status).toBe(
      StatusCodes.UNAUTHORIZED,
    );
  });

  it("adds, edits, deactivates and deletes a shift", async () => {
    const owner = await ownerWithCompany();
    const created = await shift.create(owner.cookie, NIGHT);
    expect(created.status).toBe(StatusCodes.CREATED);
    const night = await json<Template>(created);
    expect(night).toMatchObject({
      ...NIGHT,
      workingDays: [1, 2, 3, 4, 5, 6],
      inUse: false,
    });

    const off = await shift.update(owner.cookie, night.id, {
      ...NIGHT,
      isActive: false,
      expectedUpdatedAt: night.updatedAt,
    });
    expect(off.status).toBe(StatusCodes.OK);
    expect(await json(off)).toMatchObject({ isActive: false });
    const stale = await shift.update(owner.cookie, night.id, {
      ...NIGHT,
      expectedUpdatedAt: night.updatedAt,
    });
    expect(stale.status).toBe(StatusCodes.CONFLICT);
    expect(await json(stale)).toMatchObject({ code: "SHIFT_TEMPLATE_CHANGED" });

    await shift.create(owner.cookie, GENERAL);
    expect(
      (
        await json<{ items: Template[] }>(await shift.list(owner.cookie))
      ).items.map((item) => item.name),
    ).toEqual(["General", "Night"]);
    expect(
      (
        await json<{ items: Template[] }>(await shift.active(owner.cookie))
      ).items.map((item) => item.name),
    ).toEqual(["General"]);

    expect((await shift.delete(owner.cookie, night.id)).status).toBe(
      StatusCodes.NO_CONTENT,
    );
    expect((await shift.delete(owner.cookie, night.id)).status).toBe(
      StatusCodes.NOT_FOUND,
    );
    const actions = (
      await prisma.constructionOrganizationAuditEvent.findMany({
        where: { workspaceId: owner.workspaceId, entityId: night.id },
        orderBy: { occurredAt: "asc" },
      })
    ).map((event) => event.action);
    expect(actions).toEqual([
      "hrms_shift_template.created",
      "hrms_shift_template.updated",
      "hrms_shift_template.deleted",
    ]);
  });

  it("names the field a broken shift rule is about", async () => {
    const owner = await ownerWithCompany();
    const halfDay = await shift.create(owner.cookie, {
      ...GENERAL,
      halfDayHours: 8,
    });
    expect(halfDay.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await json(halfDay)).toMatchObject({
      code: "SHIFT_HALF_DAY_HOURS_INVALID",
      details: { field: "halfDayHours" },
    });
    const tooLong = await shift.create(owner.cookie, {
      ...NIGHT,
      endTime: "04:00",
      workingHours: 8,
    });
    expect(await json(tooLong)).toMatchObject({
      code: "SHIFT_WORKING_HOURS_TOO_LONG",
      details: { field: "workingHours" },
    });
    const time = await shift.create(owner.cookie, {
      ...GENERAL,
      startTime: "9.30",
    });
    expect(await json(time)).toMatchObject({ details: { field: "startTime" } });
    const shape = await shift.create(owner.cookie, {
      ...GENERAL,
      workingHours: "8",
    });
    expect(await json(shape)).toMatchObject({ code: "VALIDATION_ERROR" });
    await shift.create(owner.cookie, GENERAL);
    const twin = await shift.create(owner.cookie, {
      ...GENERAL,
      name: "general",
    });
    expect(twin.status).toBe(StatusCodes.CONFLICT);
    expect(await json(twin)).toMatchObject({ code: "SHIFT_NAME_TAKEN" });
  });

  it("builds rotations from active shifts and keeps used shifts", async () => {
    const owner = await ownerWithCompany();
    const general = await json<Template>(
      await shift.create(owner.cookie, GENERAL),
    );
    const night = await json<Template>(await shift.create(owner.cookie, NIGHT));
    const week = await rotation.create(owner.cookie, {
      name: "Crew A",
      type: "week",
      slots: [
        general.id,
        general.id,
        night.id,
        night.id,
        general.id,
        general.id,
        null,
      ],
      isActive: true,
    });
    expect(week.status).toBe(StatusCodes.CREATED);
    const crew = await json<Rotation>(week);
    expect(crew).toMatchObject({ type: "week", daysPerCycle: 7 });
    expect(crew.slots[6]).toBeNull();

    const cycle = await json<Rotation>(
      await rotation.create(owner.cookie, {
        name: "Two on one off",
        type: "custom_cycle",
        daysPerCycle: 3,
        slots: [general.id, night.id, null],
        isActive: true,
      }),
    );
    expect(cycle.daysPerCycle).toBe(3);

    const shortCycle = await rotation.create(owner.cookie, {
      name: "Too short",
      type: "custom_cycle",
      daysPerCycle: 1,
      slots: [general.id],
      isActive: true,
    });
    expect(await json(shortCycle)).toMatchObject({
      code: "ROTATION_CYCLE_INVALID",
      details: { field: "daysPerCycle" },
    });
    const wrongCount = await rotation.create(owner.cookie, {
      name: "Month",
      type: "month",
      slots: [general.id],
      isActive: true,
    });
    expect(await json(wrongCount)).toMatchObject({
      code: "ROTATION_SLOTS_INVALID",
      details: { field: "slots" },
    });

    // The night shift is in use now: it cannot be deleted, only deactivated.
    const inUse = await shift.delete(owner.cookie, night.id);
    expect(inUse.status).toBe(StatusCodes.CONFLICT);
    expect(await json(inUse)).toMatchObject({ code: "SHIFT_TEMPLATE_IN_USE" });
    const listed = await json<{ items: Template[] }>(
      await shift.list(owner.cookie),
    );
    expect(listed.items.find((item) => item.id === night.id)?.inUse).toBe(true);
    const nightOff = await json<Template>(
      await shift.update(owner.cookie, night.id, {
        ...NIGHT,
        isActive: false,
        expectedUpdatedAt: night.updatedAt,
      }),
    );
    expect(nightOff.isActive).toBe(false);

    // A new rotation cannot use the inactive shift …
    const inactive = await rotation.create(owner.cookie, {
      name: "Nights",
      type: "custom_cycle",
      daysPerCycle: 2,
      slots: [night.id, null],
      isActive: true,
    });
    expect(await json(inactive)).toMatchObject({
      code: "ROTATION_SHIFT_INACTIVE",
    });
    // … but the rotation that already had it can still be edited.
    const renamed = await rotation.update(owner.cookie, crew.id, {
      name: "Crew A (2026)",
      type: "week",
      slots: crew.slots,
      isActive: true,
      expectedUpdatedAt: crew.updatedAt,
    });
    expect(renamed.status).toBe(StatusCodes.OK);
    const stale = await rotation.update(owner.cookie, crew.id, {
      name: "Crew A",
      type: "week",
      slots: crew.slots,
      isActive: true,
      expectedUpdatedAt: crew.updatedAt,
    });
    expect(stale.status).toBe(StatusCodes.CONFLICT);
    expect(await json(stale)).toMatchObject({
      code: "ROTATION_TEMPLATE_CHANGED",
    });

    // An unassigned rotation can be deleted; then its shifts are free.
    expect((await rotation.delete(owner.cookie, crew.id)).status).toBe(
      StatusCodes.NO_CONTENT,
    );
    expect((await rotation.delete(owner.cookie, cycle.id)).status).toBe(
      StatusCodes.NO_CONTENT,
    );
    expect((await shift.delete(owner.cookie, night.id)).status).toBe(
      StatusCodes.NO_CONTENT,
    );
    expect(
      (await json<{ items: Rotation[] }>(await rotation.list(owner.cookie)))
        .items,
    ).toEqual([]);
    expect(
      (await json<{ items: Rotation[] }>(await rotation.active(owner.cookie)))
        .items,
    ).toEqual([]);
  });

  it("needs hrms.shifts and keeps each Company's templates to itself", async () => {
    const owner = await ownerWithCompany();
    const general = await json<Template>(
      await shift.create(owner.cookie, GENERAL),
    );
    const reader = await memberWith(owner, { "hrms.shifts": ["read"] });
    expect((await shift.list(reader.cookie)).status).toBe(StatusCodes.OK);
    for (const response of [
      await shift.create(reader.cookie, NIGHT),
      await shift.delete(reader.cookie, general.id),
      await rotation.create(reader.cookie, {
        name: "x",
        type: "custom_cycle",
        daysPerCycle: 2,
        slots: [general.id, null],
        isActive: true,
      }),
    ]) {
      expect(response.status).toBe(StatusCodes.FORBIDDEN);
      expect(await json(response)).toMatchObject({ code: "PERMISSION_DENIED" });
    }
    const nobody = await memberWith(owner, { "hrms.settings": ["read"] });
    expect((await shift.list(nobody.cookie)).status).toBe(
      StatusCodes.FORBIDDEN,
    );

    const other = await ownerWithCompany("Other Builders");
    expect(
      (
        await shift.update(other.cookie, general.id, {
          ...GENERAL,
          expectedUpdatedAt: general.updatedAt,
        })
      ).status,
    ).toBe(StatusCodes.NOT_FOUND);
    // A rotation cannot name another Company's shift.
    const foreign = await rotation.create(other.cookie, {
      name: "Borrowed",
      type: "custom_cycle",
      daysPerCycle: 2,
      slots: [general.id, null],
      isActive: true,
    });
    expect(await json(foreign)).toMatchObject({
      code: "ROTATION_SHIFT_NOT_FOUND",
    });
  });

  it("is on /api/docs", async () => {
    const spec = await json<{
      paths: Record<string, Record<string, unknown>>;
    }>(getOpenApi());
    for (const base of [
      "/api/construction/hrms/shift-templates",
      "/api/construction/hrms/rotation-templates",
    ]) {
      expect(spec.paths[base]?.["get"]).toBeDefined();
      expect(spec.paths[base]?.["post"]).toBeDefined();
      expect(spec.paths[`${base}/active`]?.["get"]).toBeDefined();
      expect(spec.paths[`${base}/{id}/update`]?.["post"]).toBeDefined();
      expect(spec.paths[`${base}/{id}/delete`]?.["post"]).toBeDefined();
    }
  });
});
