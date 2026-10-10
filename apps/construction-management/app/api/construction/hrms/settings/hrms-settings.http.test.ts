import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it } from "vitest";

import { GET as getOpenApi } from "@/app/api/openapi.json/route";
import { jsonRequest, memberWith, ownerWithCompany } from "@/test/companies";
import { TEST_ORIGIN } from "@/test/sessions";

import { GET as getSettings } from "./route";
import { POST as updateSettings } from "./update/route";

const URL_BASE = `${TEST_ORIGIN}/api/construction/hrms/settings`;

type SettingsBody = {
  gpsRequirement: string;
  graceMinutes: number;
  workingHoursPerDay: number;
  halfDayHours: number;
  workingDays: number[];
  leaveApprovalLevels: number;
  leaveYear: string;
  carryForwardEnabled: boolean;
  carryForwardMaxDays: number | null;
  leaveAccrualEnabled: boolean;
  autoSalaryCalculation: boolean;
  salaryCalculationDay: number | null;
  ptStateCode: string | null;
  updatedAt: string | null;
};

const DEFAULTS = {
  gpsRequirement: "disabled",
  graceMinutes: 15,
  workingHoursPerDay: 8,
  halfDayHours: 4,
  workingDays: [1, 2, 3, 4, 5],
  leaveApprovalLevels: 1,
  leaveYear: "calendar",
  carryForwardEnabled: false,
  carryForwardMaxDays: null,
  leaveAccrualEnabled: false,
  autoSalaryCalculation: false,
  salaryCalculationDay: null,
  ptStateCode: null,
};

const SIX_DAY_WEEK = {
  ...DEFAULTS,
  gpsRequirement: "required",
  graceMinutes: 10,
  workingHoursPerDay: 9.5,
  halfDayHours: 4.75,
  workingDays: [6, 1, 2, 3, 4, 5],
  leaveApprovalLevels: 2,
  leaveYear: "financial",
  carryForwardEnabled: true,
  carryForwardMaxDays: 12.5,
  leaveAccrualEnabled: true,
  autoSalaryCalculation: true,
  salaryCalculationDay: 28,
  ptStateCode: "29",
};

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

const read = (cookie: string) => getSettings(jsonRequest(URL_BASE, cookie));
const save = (cookie: string, body: unknown) =>
  updateSettings(jsonRequest(`${URL_BASE}/update`, cookie, body));

describe("HRMS Settings HTTP (CM-303)", () => {
  it("is 401 without a Session", async () => {
    expect((await getSettings(new Request(URL_BASE))).status).toBe(
      StatusCodes.UNAUTHORIZED,
    );
    expect(
      (
        await updateSettings(
          new Request(`${URL_BASE}/update`, {
            method: "POST",
            body: "{}",
          }),
        )
      ).status,
    ).toBe(StatusCodes.UNAUTHORIZED);
  });

  it("answers the defaults for a Company that never saved them", async () => {
    const owner = await ownerWithCompany();
    const response = await read(owner.cookie);
    expect(response.status).toBe(StatusCodes.OK);
    expect(await json(response)).toEqual({ ...DEFAULTS, updatedAt: null });
  });

  it("saves on the first save, audits it and refuses a stale save", async () => {
    const owner = await ownerWithCompany();
    const response = await save(owner.cookie, {
      ...SIX_DAY_WEEK,
      expectedUpdatedAt: null,
    });
    expect(response.status).toBe(StatusCodes.OK);
    const saved = await json<SettingsBody>(response);
    expect(saved).toMatchObject({
      ...SIX_DAY_WEEK,
      workingDays: [1, 2, 3, 4, 5, 6],
    });
    expect(saved.updatedAt).not.toBeNull();
    expect(await json(await read(owner.cookie))).toEqual(saved);

    const row = await prisma.constructionHrmsSettings.findUniqueOrThrow({
      where: { workspaceId: owner.workspaceId },
    });
    expect(row.workingHoursPerDay.toFixed(2)).toBe("9.50");
    expect(row.createdBy).toBe(owner.userId);

    // A save based on the never-saved defaults is refused, not overwritten.
    const stale = await save(owner.cookie, {
      ...DEFAULTS,
      expectedUpdatedAt: null,
    });
    expect(stale.status).toBe(StatusCodes.CONFLICT);
    expect(await json(stale)).toMatchObject({ code: "HRMS_SETTINGS_CHANGED" });

    const next = await save(owner.cookie, {
      ...SIX_DAY_WEEK,
      autoSalaryCalculation: false,
      salaryCalculationDay: 28,
      expectedUpdatedAt: saved.updatedAt,
    });
    expect(next.status).toBe(StatusCodes.OK);
    expect(await json(next)).toMatchObject({
      autoSalaryCalculation: false,
      salaryCalculationDay: null,
    });

    const audit = await prisma.constructionOrganizationAuditEvent.findMany({
      where: {
        workspaceId: owner.workspaceId,
        action: "hrms_settings.updated",
      },
      orderBy: { occurredAt: "asc" },
    });
    expect(audit).toHaveLength(2);
    expect(audit[0]?.before).toMatchObject({ graceMinutes: 15 });
    expect(audit[0]?.after).toMatchObject({
      graceMinutes: 10,
      ptStateCode: "29",
    });
    expect(audit[1]?.before).toMatchObject({ salaryCalculationDay: 28 });
  });

  it("names the field a broken rule is about", async () => {
    const owner = await ownerWithCompany();
    const halfDay = await save(owner.cookie, {
      ...DEFAULTS,
      halfDayHours: 8,
      expectedUpdatedAt: null,
    });
    expect(halfDay.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await json(halfDay)).toMatchObject({
      code: "HALF_DAY_HOURS_INVALID",
      details: { field: "halfDayHours" },
    });

    const salaryDay = await save(owner.cookie, {
      ...DEFAULTS,
      autoSalaryCalculation: true,
      salaryCalculationDay: null,
      expectedUpdatedAt: null,
    });
    expect(await json(salaryDay)).toMatchObject({
      code: "SALARY_DAY_REQUIRED",
      details: { field: "salaryCalculationDay" },
    });

    const shape = await save(owner.cookie, {
      ...DEFAULTS,
      gpsRequirement: "sometimes",
      expectedUpdatedAt: null,
    });
    expect(shape.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await json(shape)).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(
      await prisma.constructionHrmsSettings.count({
        where: { workspaceId: owner.workspaceId },
      }),
    ).toBe(0);
  });

  it("needs hrms.settings: read to see, update to save", async () => {
    const owner = await ownerWithCompany();
    const nobody = await memberWith(owner, {
      "hrms.attendance": ["create", "read"],
    });
    for (const response of [
      await read(nobody.cookie),
      await save(nobody.cookie, { ...DEFAULTS, expectedUpdatedAt: null }),
    ]) {
      expect(response.status).toBe(StatusCodes.FORBIDDEN);
      expect(await json(response)).toMatchObject({ code: "PERMISSION_DENIED" });
    }

    const reader = await memberWith(owner, { "hrms.settings": ["read"] });
    expect((await read(reader.cookie)).status).toBe(StatusCodes.OK);
    expect(
      (await save(reader.cookie, { ...DEFAULTS, expectedUpdatedAt: null }))
        .status,
    ).toBe(StatusCodes.FORBIDDEN);

    const editor = await memberWith(owner, {
      "hrms.settings": ["read", "update"],
    });
    const saved = await save(editor.cookie, {
      ...SIX_DAY_WEEK,
      expectedUpdatedAt: null,
    });
    expect(saved.status).toBe(StatusCodes.OK);
    expect(await json(await read(owner.cookie))).toMatchObject({
      gpsRequirement: "required",
    });
  });

  it("keeps each Company's settings to itself", async () => {
    const first = await ownerWithCompany("First Builders");
    const second = await ownerWithCompany("Second Builders");
    expect(
      (await save(first.cookie, { ...SIX_DAY_WEEK, expectedUpdatedAt: null }))
        .status,
    ).toBe(StatusCodes.OK);
    expect(await json(await read(second.cookie))).toEqual({
      ...DEFAULTS,
      updatedAt: null,
    });
    // The other Company's first save is its own, not a stale write.
    expect(
      (await save(second.cookie, { ...DEFAULTS, expectedUpdatedAt: null }))
        .status,
    ).toBe(StatusCodes.OK);
    expect(await json(await read(first.cookie))).toMatchObject({
      gpsRequirement: "required",
    });
  });

  it("is on /api/docs with ConstructionHrms components", async () => {
    const spec = await json<{
      paths: Record<string, Record<string, unknown>>;
      components: { schemas: Record<string, unknown> };
    }>(getOpenApi());
    expect(
      spec.paths["/api/construction/hrms/settings"]?.["get"],
    ).toBeDefined();
    expect(
      spec.paths["/api/construction/hrms/settings/update"]?.["post"],
    ).toBeDefined();
    expect(
      spec.components.schemas["UpdateConstructionHrmsSettingsRequest"],
    ).toBeDefined();
    expect(
      spec.components.schemas["GetConstructionHrmsSettingsResponse"],
    ).toBeDefined();
  });
});
