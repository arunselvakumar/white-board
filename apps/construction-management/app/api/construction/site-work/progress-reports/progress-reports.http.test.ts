import { randomUUID } from "node:crypto";

import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";

import { GET as getOpenApi } from "@/app/api/openapi.json/route";
import { attendanceHeadsBetween } from "@/src/composition/attendance-heads";
import {
  createProgressReportSource,
  dprEquipmentUsage,
  dprWorksheets,
  projectLocationLabeller,
} from "@/src/composition/progress-report-source";
import { createProgressReportHandlers } from "@/src/composition/progress-reports";
import { createReportJobs } from "@/src/composition/report-jobs";
import type { DprSource } from "@/src/reporting/application/ports";
import type { Flag } from "@/src/shared-kernel/access";
import { loadMemberAccess } from "@/src/shared-kernel/access/prisma-access-reader";
import { addDays, todayIn } from "@/src/shared-kernel/calendar-date";
import { objectStorage } from "@/src/shared-kernel/files/storage-from-env";
import { actAs, addMember, addProject, newCompany } from "@/test/companies";
import { bytesOf } from "@/test/files";
import { addContractor, addMaterial } from "@/test/procurement";
import {
  progressAddDepartment,
  progressAddLabourCategory,
  progressAddUsageSheet,
  progressAddWorksheet,
  sharedAddSiteDiaryRow,
} from "@/test/site-work";

import { POST as remove } from "./[id]/delete/route";
import { GET as download } from "./[id]/download/route";
import { POST as retry } from "./[id]/retry/route";
import { GET as getOne } from "./[id]/route";
import { GET as formOptions } from "./form-options/route";
import { GET as list, POST as create } from "./route";

vi.mock(import("@repo/auth/construction/server"), async (importOriginal) => ({
  ...(await importOriginal()),
  getCompanyAuthFromHeaders: vi.fn(),
}));

const BASE = "http://localhost/api/construction/site-work/progress-reports";
const TODAY = todayIn("Asia/Kolkata");
const DAY = addDays(TODAY, -2);
const MENU = "site_work.progress_reports";
const USAGE = "site_work.equipment_usage";

type Report = {
  id: string;
  number: string;
  date: string;
  status: string;
  error: string | null;
  includesMoney: boolean;
  filledBy: { userId: string; name: string | null } | null;
  requestedBy: { userId: string; name: string | null };
  download: string | null;
  actions: { download: boolean; retry: boolean; delete: boolean };
};
type ErrorBody = { code: string; details?: { field?: string } };

const params = (id: string) => ({ params: Promise.resolve({ id }) });
const get = (path: string) => new Request(`${BASE}${path}`);
const post = (path: string, body?: unknown) =>
  new Request(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function setup() {
  const company = await newCompany();
  const owner = {
    userId: company.ownerId,
    workspaceId: company.workspaceId,
    role: "owner" as const,
  };
  const projectId = await addProject(
    company.workspaceId,
    company.ownerId,
    "Tower A",
  );
  const contractorId = await addContractor(
    company.workspaceId,
    company.ownerId,
    [projectId],
  );
  const departmentId = await progressAddDepartment(
    company.workspaceId,
    company.ownerId,
    "Slab and Formwork",
  );
  actAs(owner);
  return { company, owner, projectId, contractorId, departmentId };
}

type Ctx = Awaited<ReturnType<typeof setup>>;

async function member(
  ctx: Ctx,
  grants: Record<string, Flag[]>,
  onProject = true,
) {
  const added = await addMember(
    ctx.company.workspaceId,
    ctx.company.ownerId,
    grants,
  );
  if (onProject)
    await prisma.constructionOrganizationTeamMemberProject.create({
      data: { memberId: added.memberId, projectId: ctx.projectId },
    });
  return {
    userId: added.userId,
    workspaceId: ctx.company.workspaceId,
    role: "member" as const,
  };
}

function generate(ctx: Ctx, patch: Record<string, unknown> = {}) {
  return create(post("", { projectId: ctx.projectId, date: DAY, ...patch }));
}

async function generated(
  ctx: Ctx,
  patch: Record<string, unknown> = {},
): Promise<Report> {
  const response = await generate(ctx, patch);
  expect(response.status).toBe(StatusCodes.CREATED);
  const report = await json<Report>(response);
  expect(report.error).toBeNull();
  expect(report.status).toBe("done");
  return report;
}

describe("Progress Reports: the Daily Progress Report", () => {
  it("numbers one DPR per Project and date, reuses it on regenerate and downloads a PDF", async () => {
    const ctx = await setup();
    await progressAddWorksheet(ctx.company.workspaceId, ctx.projectId, {
      date: DAY,
      createdBy: ctx.company.ownerId,
      contractorId: ctx.contractorId,
      departmentId: ctx.departmentId,
      skilled: 3,
      unskilled: 5,
      remark: "தளம் போடப்பட்டது / स्लैब डाली गई",
    });
    const first = await generated(ctx);
    expect(first.number).toMatch(/^DPR\/\d{2}-\d{2}\/00001$/);
    expect(first).toMatchObject({
      date: DAY,
      filledBy: null,
      includesMoney: true,
      requestedBy: { userId: ctx.company.ownerId, name: "Arun Selva Kumar" },
      actions: { download: true, retry: false, delete: true },
    });
    expect(first.download).toBe(
      `/api/construction/site-work/progress-reports/${first.id}/download`,
    );

    const again = await generated(ctx, { includeImages: true });
    expect(again.id).not.toBe(first.id);
    expect(again.number).toBe(first.number);

    const earlier = await generated(ctx, { date: addDays(DAY, -1) });
    expect(earlier.number).toMatch(/\/00002$/);

    // Two requests racing for a new date share one number.
    const [a, b] = await Promise.all([
      generate(ctx, { date: addDays(DAY, -5) }),
      generate(ctx, { date: addDays(DAY, -5) }),
    ]);
    const [racedA, racedB] = await Promise.all([
      json<Report>(a),
      json<Report>(b),
    ]);
    expect(racedA.number).toBe(racedB.number);
    expect(racedA.number).toMatch(/\/00003$/);
    expect(
      await prisma.constructionSiteWorkProgressReportNumber.count({
        where: { projectId: ctx.projectId },
      }),
    ).toBe(3);

    const listed = await json<{ items: Report[] }>(
      await list(get(`?projectId=${ctx.projectId}`)),
    );
    expect(listed.items).toHaveLength(5);
    expect(listed.items.at(-1)?.id).toBe(first.id);

    const file = await download(get(`/${first.id}/download`), params(first.id));
    expect(file.status).toBe(StatusCodes.OK);
    expect(file.headers.get("content-type")).toBe("application/pdf");
    expect(file.headers.get("content-disposition")).toContain(
      `${first.number.replace(/\//g, "-")}-${DAY}.pdf`,
    );
    const bytes = await bytesOf(file);
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");

    const one = await json<Report>(
      await getOne(get(`/${first.id}`), params(first.id)),
    );
    expect(one.number).toBe(first.number);
  });

  it("offers today and the Project's Team Members, and validates the request", async () => {
    const ctx = await setup();
    const engineer = await member(ctx, { [MENU]: ["create", "read"] });
    const offered = await json<{
      today: string;
      teamMembers: { userId: string }[];
      types: { key: string; available: boolean; note: string | null }[];
    }>(await formOptions(get(`/form-options?projectId=${ctx.projectId}`)));
    expect(offered.today).toBe(TODAY);
    expect(offered.teamMembers.map((m) => m.userId).sort()).toEqual(
      [ctx.company.ownerId, engineer.userId].sort(),
    );
    expect(offered.types).toEqual([
      {
        key: "daily_progress_report",
        label: "Daily Progress Report",
        available: true,
        note: null,
      },
      {
        key: "task_progress_report",
        label: "Task Progress Report",
        available: false,
        note: "Coming with Tasks (M8)",
      },
    ]);

    const future = await generate(ctx, { date: addDays(TODAY, 1) });
    expect(future.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await json<ErrorBody>(future)).toMatchObject({
      code: "PROGRESS_REPORT_DATE_IN_FUTURE",
      details: { field: "date" },
    });
    const stranger = await generate(ctx, { filledBy: randomUUID() });
    expect(stranger.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await json<ErrorBody>(stranger)).toMatchObject({
      code: "FILLED_BY_NOT_FOUND",
      details: { field: "filledBy" },
    });
    const bad = await generate(ctx, { date: "08-10-2026" });
    expect(bad.status).toBe(StatusCodes.BAD_REQUEST);
    expect(
      (await create(post("", { projectId: randomUUID(), date: DAY }))).status,
    ).toBe(StatusCodes.BAD_REQUEST);
  });

  it("Filled By keeps only that author's worksheets and usage sheets, and prints the name", async () => {
    const ctx = await setup();
    const ws = ctx.company.workspaceId;
    const engineer = await member(ctx, { [MENU]: ["create", "read"] });
    const sheet = (createdBy: string, skilled: number) =>
      progressAddWorksheet(ws, ctx.projectId, {
        date: DAY,
        createdBy,
        contractorId: ctx.contractorId,
        departmentId: ctx.departmentId,
        skilled,
        unskilled: 1,
      });
    const mine = await sheet(engineer.userId, 4);
    const owners = await sheet(ctx.company.ownerId, 7);
    const myUsage = await progressAddUsageSheet(ws, ctx.projectId, {
      date: DAY,
      createdBy: engineer.userId,
    });
    await progressAddUsageSheet(ws, ctx.projectId, {
      date: DAY,
      createdBy: ctx.company.ownerId,
    });
    // A rejected sheet stays out, as on the Daily Work report.
    const rejected = await sheet(engineer.userId, 9);
    await prisma.constructionSiteWorkWorksheet.update({
      where: { id: rejected.id },
      data: { approvalStatus: "rejected", rejectionReason: "Counts wrong" },
    });
    // Another day's sheet stays out.
    await progressAddWorksheet(ws, ctx.projectId, {
      date: addDays(DAY, -1),
      createdBy: engineer.userId,
      contractorId: ctx.contractorId,
      departmentId: ctx.departmentId,
    });

    const source = createProgressReportSource();
    const read = (filledBy: string | null) =>
      source.read({
        workspaceId: ws,
        projectId: ctx.projectId,
        money: false,
        params: {
          kind: "daily_progress_report",
          date: DAY,
          filledBy,
          includeImages: false,
          number: "DPR/26-27/00001",
        },
      });
    const everyone = await read(null);
    expect(everyone.worksheets.map((w) => w.id).sort()).toEqual(
      [mine.id, owners.id].sort(),
    );
    expect(everyone.equipment).toHaveLength(2);
    expect(everyone.filledBy).toBeNull();
    const filtered = await read(engineer.userId);
    expect(filtered.worksheets.map((w) => w.id)).toEqual([mine.id]);
    expect(filtered.equipment.map((s) => s.id)).toEqual([myUsage.id]);
    expect(filtered.filledBy).toBe("Prabhu Saravanan");

    const report = await generated(ctx, { filledBy: engineer.userId });
    expect(report.filledBy).toEqual({
      userId: engineer.userId,
      name: "Prabhu Saravanan",
    });
  });

  it("prints hire cost only for a requester with Financial on Equipment Usage, and stores the flag", async () => {
    const ctx = await setup();
    const ws = ctx.company.workspaceId;
    const rented = await progressAddUsageSheet(ws, ctx.projectId, {
      date: DAY,
      createdBy: ctx.company.ownerId,
      ownership: "rented",
      hireCost: 812_550n,
      usageHours: null,
      timeShiftMinutes: [240, 150],
    });
    await progressAddUsageSheet(ws, ctx.projectId, {
      date: DAY,
      createdBy: ctx.company.ownerId,
      usageHours: "6.50",
    });
    const query = {
      workspaceId: ws,
      projectId: ctx.projectId,
      date: DAY,
      filledBy: null,
    };
    const withMoney = await dprEquipmentUsage(
      prisma,
      { ...query, money: true },
      () => null,
    );
    const hired = withMoney.find((sheet) => sheet.id === rented.id);
    expect(hired).toMatchObject({
      ownership: "rented",
      hireCost: 812_550n,
      // No hours on the sheet: the sum of its time shifts.
      usageHours: "6.50",
      fuel: { quantity: "18.000", unit: "Litre", borneBy: "company" },
    });
    expect(
      withMoney.find((sheet) => sheet.id !== rented.id)?.hireCost,
    ).toBeNull();
    const without = await dprEquipmentUsage(
      prisma,
      { ...query, money: false },
      () => null,
    );
    expect(without.every((sheet) => sheet.hireCost == null)).toBe(true);

    const noMoney = await member(ctx, {
      [MENU]: ["create", "read"],
      [USAGE]: ["read"],
    });
    const withF = await member(ctx, {
      [MENU]: ["create", "read"],
      [USAGE]: ["read", "financial"],
    });
    actAs(noMoney);
    const plain = await generated(ctx);
    expect(plain.includesMoney).toBe(false);
    actAs(withF);
    const costed = await generated(ctx);
    expect(costed.includesMoney).toBe(true);
    const stored = await prisma.constructionReportingReportJob.findMany({
      where: { id: { in: [plain.id, costed.id] } },
      select: { id: true, includesMoney: true },
    });
    expect(
      Object.fromEntries(stored.map((row) => [row.id, row.includesMoney])),
    ).toEqual({ [plain.id]: false, [costed.id]: true });

    // Without Financial, a costed report is listed but not downloadable.
    actAs(noMoney);
    const listed = await json<{ items: Report[] }>(
      await list(get(`?projectId=${ctx.projectId}`)),
    );
    const seen = listed.items.find((item) => item.id === costed.id);
    expect(seen).toMatchObject({
      download: null,
      actions: { download: false },
    });
    expect(
      (await download(get(`/${costed.id}/download`), params(costed.id))).status,
    ).toBe(StatusCodes.FORBIDDEN);
    expect(
      (await download(get(`/${plain.id}/download`), params(plain.id))).status,
    ).toBe(StatusCodes.OK);
  });

  it("reads the day's diary, attendance by skill, worksheets, materials and photos", async () => {
    const ctx = await setup();
    const ws = ctx.company.workspaceId;
    const by = ctx.company.ownerId;
    const audit = { createdBy: by, updatedBy: by };
    const skilled = await progressAddLabourCategory(ws, by, "skilled");
    const unskilled = await progressAddLabourCategory(ws, by, "unskilled");
    const labour = async (categoryId: string | null) => {
      const id = randomUUID();
      await prisma.constructionLabourLabour.create({
        data: {
          id,
          workspaceId: ws,
          name: `Labour ${id.slice(0, 4)}`,
          joiningDate: new Date("2026-01-01T00:00:00Z"),
          wageType: "daily",
          wagePerDay: 80_000,
          overtimeWagePerHour: 0,
          weeklyHolidays: [0],
          labourCategoryId: categoryId,
          currentProjectId: ctx.projectId,
          ...audit,
        },
      });
      return id;
    };
    const mark = async (
      labourId: string,
      status: "present" | "half_day" | "absent",
    ) =>
      prisma.constructionLabourAttendance.create({
        data: {
          id: randomUUID(),
          workspaceId: ws,
          projectId: ctx.projectId,
          labourId,
          attendanceDate: new Date(`${DAY}T00:00:00Z`),
          status,
          wageType: "daily",
          wageRate: 80_000,
          earned: 80_000,
          ...audit,
        },
      });
    await mark(await labour(skilled), "present");
    await mark(await labour(skilled), "half_day");
    await mark(await labour(unskilled), "present");
    await mark(await labour(null), "present");
    await mark(await labour(skilled), "absent");
    const vendorId = randomUUID();
    await prisma.constructionLabourVendor.create({
      data: {
        id: vendorId,
        workspaceId: ws,
        name: "Muthu Gang",
        joiningDate: new Date("2026-01-01T00:00:00Z"),
        ...audit,
      },
    });
    await prisma.constructionLabourVendorAttendance.create({
      data: {
        id: randomUUID(),
        workspaceId: ws,
        projectId: ctx.projectId,
        vendorId,
        attendanceDate: new Date(`${DAY}T00:00:00Z`),
        totalPay: 0,
        ...audit,
        lines: {
          create: [skilled, unskilled].map((labourCategoryId, index) => ({
            id: randomUUID(),
            shiftId: randomUUID(),
            shiftName: "Shift 1",
            labourCategoryId,
            fullDayCount: 3 + index,
            halfDayCount: 1,
            ratePerDay: 0,
            overtimePerHour: 0,
            amount: 0,
          })),
        },
      },
    });

    const cement = await addMaterial(ws, by);
    const worksheet = await progressAddWorksheet(ws, ctx.projectId, {
      date: DAY,
      createdBy: by,
      contractorId: ctx.contractorId,
      departmentId: ctx.departmentId,
      skilled: 2,
      unskilled: 2,
      approxWorkQty: "12.5",
      approxWorkUnitId: cement.uomId,
      materials: [
        {
          materialId: cement.id,
          name: cement.name,
          unit: "Bag",
          quantity: "10",
        },
      ],
    });

    // A GRN received that day, and Consumed entries: one kept, one
    // posted then reversed (an edited sheet), netting to nothing.
    const grnId = randomUUID();
    await prisma.constructionProcurementGoodsReceipt.create({
      data: {
        id: grnId,
        workspaceId: ws,
        locationKind: "project",
        locationId: ctx.projectId,
        number: `GRN/${grnId.slice(0, 6)}`,
        receiptDate: new Date(`${DAY}T00:00:00Z`),
        inventoryDate: new Date(`${DAY}T00:00:00Z`),
        supplierId: randomUUID(),
        supplierName: "Ramco Cements",
        ...audit,
        items: {
          create: {
            id: randomUUID(),
            position: 1,
            materialId: cement.id,
            materialName: cement.name,
            uomId: cement.uomId,
            uomName: "Bag",
            receivedQty: "100",
            unitRate: 40_000n,
            taxable: 4_000_000n,
            total: 4_000_000n,
          },
        },
      },
    });
    const entry = (
      sourceId: string,
      quantity: string,
      label: string,
      reverses?: string,
    ) => ({
      id: randomUUID(),
      workspaceId: ws,
      locationKind: "project" as const,
      locationId: ctx.projectId,
      materialId: cement.id,
      entryDate: new Date(`${DAY}T00:00:00Z`),
      type: "consumed" as const,
      quantity,
      sourceType: "daily_worksheet" as const,
      sourceId,
      counterpartyLabel: label,
      reversesEntryId: reverses ?? null,
      createdBy: by,
    });
    await prisma.constructionProcurementStockEntry.create({
      data: entry(worksheet.id, "-10", `Consumed by ${worksheet.number}`),
    });
    const gone = entry(randomUUID(), "-4", "Consumed by WS/old");
    await prisma.constructionProcurementStockEntry.create({ data: gone });
    await prisma.constructionProcurementStockEntry.create({
      data: entry(gone.sourceId, "4", "Consumed by WS/old", gone.id),
    });

    const diary = await sharedAddSiteDiaryRow(ws, by, ctx.projectId, DAY);
    await prisma.constructionSiteWorkSiteDiary.update({
      where: { id: diary.id },
      data: {
        weatherMorning: "sunny",
        weatherAfternoon: "light_rain",
        siteCondition: "Wet near the gate",
        notes: "மழை காரணமாக வேலை நின்றது",
      },
    });
    const photo = new Uint8Array(
      await sharp({
        create: { width: 32, height: 24, channels: 3, background: "#c08040" },
      })
        .webp()
        .toBuffer(),
    );
    const photoKey = `companies/${ws}/site-work/${randomUUID()}.webp`;
    await objectStorage().put(photoKey, photo, "image/webp");
    for (const [documentType, documentId] of [
      ["site_diary", diary.id],
      ["worksheet", worksheet.id],
    ] as const)
      await prisma.constructionSiteWorkDocumentFile.create({
        data: {
          id: randomUUID(),
          workspaceId: ws,
          documentType,
          documentId,
          fileKey: `${photoKey}.${documentType}`,
          thumbKey: photoKey,
          fileName: "site.jpg",
          contentType: "image/jpeg",
          bytes: photo.byteLength,
          createdBy: by,
        },
      });

    const model = await createProgressReportSource().read({
      workspaceId: ws,
      projectId: ctx.projectId,
      money: true,
      params: {
        kind: "daily_progress_report",
        date: DAY,
        filledBy: null,
        includeImages: true,
        number: "DPR/26-27/00009",
      },
    });
    expect(model.project.name).toBe("Tower A");
    expect(model.attendance).toEqual({
      labourPresent: { skilled: 1, unskilled: 2 },
      labourHalfDay: { skilled: 1, unskilled: 0 },
      vendorFullDay: { skilled: 3, unskilled: 4 },
      vendorHalfDay: { skilled: 1, unskilled: 1 },
    });
    // The same totals as the shared attendance reader.
    const shared = await attendanceHeadsBetween(prisma, ws, ctx.projectId, {
      from: DAY,
      to: DAY,
    });
    const total = (skill: "skilled" | "unskilled") =>
      [
        model.attendance.labourPresent,
        model.attendance.labourHalfDay,
        model.attendance.vendorFullDay,
        model.attendance.vendorHalfDay,
      ].reduce((sum, heads) => sum + heads[skill], 0);
    expect(total("skilled")).toBe(
      shared
        .filter((row) => row.skill === "skilled")
        .reduce((sum, row) => sum + row.heads, 0),
    );
    expect(total("unskilled")).toBe(
      shared
        .filter((row) => row.skill !== "skilled")
        .reduce((sum, row) => sum + row.heads, 0),
    );
    expect(model.worksheets).toEqual([
      expect.objectContaining({
        number: worksheet.number,
        shift: "Shift 1",
        department: "Slab and Formwork",
        approxWork: { quantity: "12.500", unit: "Bag" },
        materials: [{ name: cement.name, quantity: "10.000", unit: "Bag" }],
      }),
    ]);
    expect(model.received).toEqual([
      expect.objectContaining({
        source: "goods_receipt",
        from: "Ramco Cements",
        quantity: "100.000",
        unit: "Bag",
      }),
    ]);
    expect(model.consumed).toEqual([
      {
        material: cement.name,
        quantity: "10.000",
        unit: "Bag",
        source: `Consumed by ${worksheet.number}`,
      },
    ]);
    expect(model.diary).toMatchObject({
      weatherMorning: "Sunny",
      weatherAfternoon: "Light rain",
      siteCondition: "Wet near the gate",
    });
    expect(model.photos.map((p) => p.caption)).toEqual([
      `Worksheet ${worksheet.number}`,
      "Site Diary",
    ]);
    expect(model.photos[0]).toMatchObject({
      key: photoKey,
      contentType: "image/webp",
    });

    const worksheetsOnly = await dprWorksheets(
      prisma,
      { workspaceId: ws, projectId: ctx.projectId, date: DAY, filledBy: null },
      () => "Wing A",
    );
    expect(worksheetsOnly[0]?.location).toBe("Wing A");

    // `next dev` can store `{}` for no location: it prints as none.
    await prisma.$executeRaw`UPDATE construction_site_work.worksheets SET site_location = '{}'::jsonb WHERE id = ${worksheet.id}::uuid`;
    const labelled = await dprWorksheets(
      prisma,
      { workspaceId: ws, projectId: ctx.projectId, date: DAY, filledBy: null },
      await projectLocationLabeller(ws, ctx.projectId),
    );
    expect(labelled[0]?.location).toBeNull();

    const report = await generated(ctx, { includeImages: true });
    const file = await download(
      get(`/${report.id}/download`),
      params(report.id),
    );
    expect(file.status).toBe(StatusCodes.OK);
  });

  it("needs C to generate, R to list and read, D to delete; another Company's report is 404", async () => {
    const ctx = await setup();
    const report = await generated(ctx);

    const reader = await member(ctx, { [MENU]: ["read"] });
    const creator = await member(ctx, { [MENU]: ["create"] });
    const deleter = await member(ctx, { [MENU]: ["read", "delete"] });
    const offProject = await member(
      ctx,
      { [MENU]: ["create", "read", "delete"] },
      false,
    );

    actAs(reader);
    expect((await generate(ctx)).status).toBe(StatusCodes.FORBIDDEN);
    expect((await list(get(`?projectId=${ctx.projectId}`))).status).toBe(
      StatusCodes.OK,
    );
    expect(
      (await formOptions(get(`/form-options?projectId=${ctx.projectId}`)))
        .status,
    ).toBe(StatusCodes.FORBIDDEN);
    expect(
      (await remove(post(`/${report.id}/delete`), params(report.id))).status,
    ).toBe(StatusCodes.FORBIDDEN);
    const readerView = await json<Report>(
      await getOne(get(`/${report.id}`), params(report.id)),
    );
    // The Owner's report shows hire cost; this reader has no Financial.
    expect(readerView.actions).toEqual({
      download: false,
      retry: false,
      delete: false,
    });

    actAs(creator);
    expect((await list(get(`?projectId=${ctx.projectId}`))).status).toBe(
      StatusCodes.FORBIDDEN,
    );
    expect((await generate(ctx)).status).toBe(StatusCodes.CREATED);

    actAs(offProject);
    expect((await generate(ctx)).status).toBe(StatusCodes.FORBIDDEN);
    expect((await getOne(get(`/${report.id}`), params(report.id))).status).toBe(
      StatusCodes.FORBIDDEN,
    );

    actAs(deleter);
    const removed = await remove(
      post(`/${report.id}/delete`),
      params(report.id),
    );
    expect(removed.status).toBe(StatusCodes.NO_CONTENT);
    expect((await getOne(get(`/${report.id}`), params(report.id))).status).toBe(
      StatusCodes.NOT_FOUND,
    );
    expect(
      await prisma.constructionReportingReportJob.count({
        where: { id: report.id },
      }),
    ).toBe(0);
    const deletedAudit = await prisma.constructionOrganizationAuditEvent.count({
      where: { entityId: report.id, action: "report_job.deleted" },
    });
    expect(deletedAudit).toBe(1);

    // The date keeps its number.
    actAs(ctx.owner);
    const again = await generated(ctx);
    expect(again.number).toBe(report.number);

    await setup();
    expect((await getOne(get(`/${again.id}`), params(again.id))).status).toBe(
      StatusCodes.NOT_FOUND,
    );
    expect(
      (await download(get(`/${again.id}/download`), params(again.id))).status,
    ).toBe(StatusCodes.NOT_FOUND);
  });

  it("retries a failed report with C, and refuses to retry one that is done", async () => {
    const ctx = await setup();
    const report = await generated(ctx);
    expect(
      (await retry(post(`/${report.id}/retry`), params(report.id))).status,
    ).toBe(StatusCodes.CONFLICT);
    await prisma.constructionReportingReportJob.update({
      where: { id: report.id },
      data: {
        status: "failed",
        error: "The report could not be generated.",
        pdfKey: null,
        fileName: null,
      },
    });
    const failed = await json<Report>(
      await getOne(get(`/${report.id}`), params(report.id)),
    );
    expect(failed).toMatchObject({
      status: "failed",
      download: null,
      actions: { retry: true },
    });
    expect(
      (await download(get(`/${report.id}/download`), params(report.id))).status,
    ).toBe(StatusCodes.CONFLICT);

    const reader = await member(ctx, { [MENU]: ["read"] });
    actAs(reader);
    expect(
      (await retry(post(`/${report.id}/retry`), params(report.id))).status,
    ).toBe(StatusCodes.FORBIDDEN);

    actAs(ctx.owner);
    const response = await retry(
      post(`/${report.id}/retry`),
      params(report.id),
    );
    expect(response.status).toBe(StatusCodes.OK);
    const retried = await json<Report>(response);
    expect(retried).toMatchObject({
      id: report.id,
      status: "done",
      error: null,
    });
    expect(retried.number).toBe(report.number);
    const file = await download(
      get(`/${report.id}/download`),
      params(report.id),
    );
    expect(new TextDecoder().decode((await bytesOf(file)).slice(0, 5))).toBe(
      "%PDF-",
    );
  });

  it("fails a report that runs past its time limit", async () => {
    const ctx = await setup();
    const slow: DprSource = {
      read: () => new Promise(() => undefined),
    };
    const handlers = createProgressReportHandlers({
      reports: createReportJobs({ dpr: slow, timeLimitMs: 50 }),
    });
    const access = await loadMemberAccess(prisma, ctx.owner);
    const report = await handlers.request(access, {
      projectId: ctx.projectId,
      date: DAY,
    });
    expect(report.status).toBe("failed");
    expect(report.error).toBe(
      "The report took longer than 1 second and was stopped. Retry it, or generate it without images.",
    );
    const row = await prisma.constructionReportingReportJob.findUniqueOrThrow({
      where: { id: report.id },
    });
    expect(row).toMatchObject({ status: "failed", pdfKey: null });
    expect(row.finishedAt).not.toBeNull();
  });

  it("is on /api/docs", async () => {
    const document = await json<{
      paths: Record<string, unknown>;
      components: { schemas: Record<string, unknown> };
    }>(getOpenApi());
    for (const path of [
      "/api/construction/site-work/progress-reports",
      "/api/construction/site-work/progress-reports/form-options",
      "/api/construction/site-work/progress-reports/{id}",
      "/api/construction/site-work/progress-reports/{id}/retry",
      "/api/construction/site-work/progress-reports/{id}/delete",
      "/api/construction/site-work/progress-reports/{id}/download",
    ])
      expect(document.paths[path], path).toBeDefined();
    for (const name of [
      "CreateConstructionSiteWorkProgressReportRequest",
      "ConstructionSiteWorkProgressReportResponse",
      "ListConstructionSiteWorkProgressReportsResponse",
      "GetConstructionSiteWorkProgressReportFormOptionsResponse",
    ])
      expect(document.components.schemas[name], name).toBeDefined();
  });
});
