import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it } from "vitest";

import { GET as getOpenApi } from "@/app/api/openapi.json/route";
import { prismaLedger } from "@/src/labour/infrastructure/prisma-ledger";
import {
  addDays,
  calendarDateToDb,
  todayIn,
} from "@/src/shared-kernel/calendar-date";
import { newId } from "@/src/shared-kernel/ids";
import {
  addProject,
  jsonRequest,
  memberWith,
  ownerWithCompany,
} from "@/test/companies";
import { TEST_ORIGIN } from "@/test/sessions";

import { GET as getSummary } from "./route";
import type { GetConstructionLabourProjectSummaryResponseModel as Summary } from "./summary-models";

const BASE = `${TEST_ORIGIN}/api/construction/labour/summary`;
const TODAY = todayIn("Asia/Kolkata");
const YESTERDAY = addDays(TODAY, -1);

type Company = Awaited<ReturnType<typeof ownerWithCompany>>;

async function labourer(company: Company, projectId: string, isActive = true) {
  const id = newId();
  await prisma.constructionLabourLabour.create({
    data: {
      id,
      workspaceId: company.workspaceId,
      name: `Labour ${id.slice(-4)}`,
      joiningDate: calendarDateToDb("2026-01-01"),
      wageType: "daily",
      wagePerDay: 80_000,
      overtimeWagePerHour: 10_000,
      weeklyHolidays: [],
      currentProjectId: projectId,
      isActive,
      createdBy: company.userId,
      updatedBy: company.userId,
    },
  });
  return id;
}

async function mark(
  company: Company,
  projectId: string,
  labourId: string,
  date: string,
  status: "present" | "half_day" | "absent" | "holiday",
) {
  await prisma.constructionLabourAttendance.create({
    data: {
      id: newId(),
      workspaceId: company.workspaceId,
      projectId,
      labourId,
      attendanceDate: calendarDateToDb(date),
      status,
      wageType: "daily",
      wageRate: 80_000,
      earned: 0,
      createdBy: company.userId,
      updatedBy: company.userId,
    },
  });
}

async function seed(company: Company) {
  const projectId = await addProject(company.workspaceId, company.userId);
  const other = await addProject(company.workspaceId, company.userId);
  const [dhuresh, kavitha, murugan, idle] = await Promise.all([
    labourer(company, projectId),
    labourer(company, projectId),
    labourer(company, projectId),
    labourer(company, projectId),
  ]);
  await labourer(company, other);
  await labourer(company, projectId, false);
  await mark(company, projectId, dhuresh, TODAY, "present");
  await mark(company, projectId, kavitha, TODAY, "half_day");
  await mark(company, projectId, murugan, TODAY, "holiday");
  await mark(company, projectId, dhuresh, YESTERDAY, "present");
  await mark(company, projectId, kavitha, YESTERDAY, "absent");

  const vendorId = newId();
  await prisma.constructionLabourVendor.create({
    data: {
      id: vendorId,
      workspaceId: company.workspaceId,
      name: "Pandian Gang",
      joiningDate: calendarDateToDb("2026-01-01"),
      createdBy: company.userId,
      updatedBy: company.userId,
      projects: { create: { projectId } },
    },
  });
  await prisma.constructionLabourVendorAttendance.create({
    data: {
      id: newId(),
      workspaceId: company.workspaceId,
      projectId,
      vendorId,
      attendanceDate: calendarDateToDb(TODAY),
      totalPay: 0,
      createdBy: company.userId,
      updatedBy: company.userId,
      lines: {
        create: {
          id: newId(),
          shiftId: newId(),
          shiftName: "Shift 1",
          labourCategoryId: newId(),
          fullDayCount: 6,
          halfDayCount: 2,
          ratePerDay: 0,
          overtimePerHour: 0,
          amount: 0,
        },
      },
    },
  });

  const entry = (
    partyType: "labour" | "vendor",
    partyId: string,
    amount: number,
  ) => ({
    partyType,
    partyId,
    projectId,
    entryDate: YESTERDAY,
    kind: amount > 0 ? ("earned" as const) : ("advance" as const),
    amount,
    sourceType: "labour_attendance" as const,
    sourceId: newId(),
    reversesEntryId: null,
  });
  await prisma.$transaction((tx) =>
    prismaLedger.post(tx, company.workspaceId, company.userId, [
      entry("labour", dhuresh, 1_60_000),
      entry("labour", kavitha, -50_000),
      entry("vendor", vendorId, 4_00_000),
    ]),
  );
  return { projectId, idle };
}

describe("project labour summary (CM-219)", () => {
  it("counts today's labour and vendor heads and splits balances", async () => {
    const company = await ownerWithCompany();
    const { projectId } = await seed(company);
    const response = await getSummary(
      jsonRequest(`${BASE}?projectId=${projectId}`, company.cookie),
    );
    expect(response.status).toBe(StatusCodes.OK);
    const summary = (await response.json()) as Summary;
    expect(summary.date).toBe(TODAY);
    expect(summary.labourers).toEqual({
      onProject: 4,
      present: 1,
      halfDay: 1,
      absent: 0,
      off: 1,
      unmarked: 1,
    });
    expect(summary.vendors).toEqual({
      assigned: 1,
      recordedToday: 1,
      headcountToday: 8,
    });
    expect(summary.presentSeries).toHaveLength(14);
    expect(summary.presentSeries.at(-1)).toEqual({
      date: TODAY,
      present: 2,
      vendorHeadcount: 8,
    });
    expect(summary.presentSeries.at(-2)).toMatchObject({
      date: YESTERDAY,
      present: 1,
    });
    expect(summary.labourBalance).toEqual({
      toPay: 1_60_000,
      advanced: 50_000,
    });
    expect(summary.vendorBalance).toEqual({ toPay: 4_00_000, advanced: 0 });
  });

  it("hides amounts without Financial and refuses without attendance read", async () => {
    const company = await ownerWithCompany();
    const { projectId } = await seed(company);
    const viewer = await memberWith(company, {
      "labour.attendance": ["read"],
    });
    await prisma.constructionOrganizationTeamMemberProject.create({
      data: { memberId: viewer.memberId, projectId },
    });
    const seen = (await (
      await getSummary(
        jsonRequest(`${BASE}?projectId=${projectId}`, viewer.cookie),
      )
    ).json()) as Summary;
    expect(seen.labourers.present).toBe(1);
    expect(seen.labourBalance).toBeNull();
    expect(seen.vendorBalance).toBeNull();

    const outsider = await memberWith(company, { "labour.labour": ["read"] });
    expect(
      (
        await getSummary(
          jsonRequest(`${BASE}?projectId=${projectId}`, outsider.cookie),
        )
      ).status,
    ).toBe(StatusCodes.FORBIDDEN);
  });

  it("is on /api/docs", async () => {
    const document = (await getOpenApi().json()) as {
      paths: Record<string, unknown>;
    };
    expect(document.paths).toHaveProperty("/api/construction/labour/summary");
  });
});
