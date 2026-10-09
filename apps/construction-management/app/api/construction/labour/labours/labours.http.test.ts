import { prisma } from "@repo/construction-db";
import ExcelJS from "exceljs";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it } from "vitest";

import { GET as getOpenApi } from "@/app/api/openapi.json/route";
import { calendarDateToDb } from "@/src/shared-kernel/calendar-date";
import type { Flag } from "@/src/shared-kernel/access";
import { newId } from "@/src/shared-kernel/ids";
import { jsonRequest, memberWith, ownerWithCompany } from "@/test/companies";
import { bytesOf, gifBytes, pngBytes } from "@/test/files";
import { TEST_ORIGIN } from "@/test/sessions";

import { POST as activateLabour } from "./[id]/activate/route";
import { POST as deactivateLabour } from "./[id]/deactivate/route";
import { POST as deleteLabour } from "./[id]/delete/route";
import { POST as deleteDocument } from "./[id]/documents/[docId]/delete/route";
import { GET as getDocument } from "./[id]/documents/[docId]/route";
import {
  GET as listDocuments,
  POST as addDocument,
} from "./[id]/documents/route";
import { POST as removePhoto } from "./[id]/photo/remove/route";
import { GET as getPhoto, POST as setPhoto } from "./[id]/photo/route";
import { GET as getLabour } from "./[id]/route";
import { GET as listTransfers } from "./[id]/transfers/route";
import { POST as updateLabour } from "./[id]/update/route";
import { GET as exportLabours } from "./export/route";
import { GET as importTemplate } from "./import-template/route";
import { POST as importLabours } from "./import/route";
import { GET as labourOptions } from "./options/route";
import { GET as listLabours, POST as createLabour } from "./route";
import { POST as transferLabours } from "./transfer/route";

const BASE = `${TEST_ORIGIN}/api/construction/labour/labours`;
const XLSX =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const VALID_AADHAAR = "234123412346";

type Labour = {
  id: string;
  name: string;
  labourCode: string | null;
  joiningDate: string;
  wageType: "daily" | "monthly";
  wagePerDay: number | null;
  wagePerMonth: number | null;
  overtimeWagePerHour: number | null;
  workingHoursPerDay: string;
  weeklyHolidays: number[];
  openingBalance: number | null;
  balance: number | null;
  aadhaarMasked: string | null;
  contactNumber: string | null;
  currentProject: { id: string; name: string };
  labourCategory: { id: string; name: string } | null;
  supervisor: { id: string; name: string } | null;
  isActive: boolean;
  photoUrl: string | null;
  updatedAt: string;
};

type Company = Awaited<ReturnType<typeof ownerWithCompany>>;

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

function docParams(id: string, docId: string) {
  return { params: Promise.resolve({ id, docId }) };
}

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function codeOf(response: Response): Promise<string> {
  return (await json<{ code: string }>(response)).code;
}

async function seedProject(workspaceId: string, name: string) {
  const id = newId();
  await prisma.constructionProjectsProject.create({
    data: { id, workspaceId, name, createdBy: "test", updatedBy: "test" },
  });
  return id;
}

async function seedCategory(
  workspaceId: string,
  name: string,
  disabled = false,
) {
  const id = newId();
  await prisma.constructionMastersLabourCategory.create({
    data: {
      id,
      workspaceId,
      name,
      disabledAt: disabled ? new Date() : null,
      createdBy: "test",
      updatedBy: "test",
    },
  });
  return id;
}

async function seedSupervisor(workspaceId: string, name: string) {
  const id = newId();
  await prisma.constructionMastersSupervisor.create({
    data: { id, workspaceId, name, createdBy: "test", updatedBy: "test" },
  });
  return id;
}

async function fixtures(company: Company) {
  const suffix = newId().slice(-6);
  const [tower, villa, mason, welder, supervisor] = await Promise.all([
    seedProject(company.workspaceId, `Tower A ${suffix}`),
    seedProject(company.workspaceId, `Villa ${suffix}`),
    seedCategory(company.workspaceId, `Mason ${suffix}`),
    seedCategory(company.workspaceId, `Welder ${suffix}`, true),
    seedSupervisor(company.workspaceId, `Sundar ${suffix}`),
  ]);
  return { tower, villa, mason, welder, supervisor, suffix };
}

function labourBody(projectId: string, extra: Record<string, unknown> = {}) {
  return {
    name: "Dhuresh Nawin",
    joiningDate: "2026-09-01",
    wageType: "daily",
    wagePerDay: 70_000,
    overtimeWagePerHour: 10_000,
    weeklyHolidays: [0],
    currentProjectId: projectId,
    ...extra,
  };
}

async function create(cookie: string, body: unknown) {
  return createLabour(jsonRequest(BASE, cookie, body));
}

async function created(cookie: string, body: unknown): Promise<Labour> {
  const response = await create(cookie, body);
  expect(response.status).toBe(StatusCodes.CREATED);
  return json<Labour>(response);
}

async function get(cookie: string, id: string): Promise<Labour> {
  const response = await getLabour(
    jsonRequest(`${BASE}/${id}`, cookie),
    params(id),
  );
  expect(response.status).toBe(StatusCodes.OK);
  return json<Labour>(response);
}

function update(cookie: string, labour: Labour, body: Record<string, unknown>) {
  return updateLabour(
    jsonRequest(`${BASE}/${labour.id}/update`, cookie, {
      name: labour.name,
      joiningDate: labour.joiningDate,
      wageType: labour.wageType,
      expectedUpdatedAt: labour.updatedAt,
      ...body,
    }),
    params(labour.id),
  );
}

function openingEntries(labourId: string) {
  return prisma.constructionLabourLedgerEntry.findMany({
    where: { partyType: "labour", partyId: labourId },
    orderBy: { createdAt: "asc" },
  });
}

async function markAttendance(
  workspaceId: string,
  labourId: string,
  projectId: string,
  date: string,
) {
  await prisma.constructionLabourAttendance.create({
    data: {
      id: newId(),
      workspaceId,
      projectId,
      labourId,
      attendanceDate: calendarDateToDb(date),
      status: "present",
      wageType: "daily",
      wageRate: 70_000,
      earned: 70_000,
      createdBy: "test",
      updatedBy: "test",
    },
  });
}

async function memberOn(
  company: Company,
  permissions: Record<string, Flag[]>,
  projectIds: string[] = [],
) {
  const member = await memberWith(company, permissions);
  if (projectIds.length > 0)
    await prisma.constructionOrganizationTeamMemberProject.createMany({
      data: projectIds.map((projectId) => ({
        memberId: member.memberId,
        projectId,
      })),
    });
  return member;
}

async function workbookOf(response: Response): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await response.arrayBuffer());
  return workbook;
}

async function xlsxBytes(
  workbook: ExcelJS.Workbook,
): Promise<Uint8Array<ArrayBuffer>> {
  const written = (await workbook.xlsx.writeBuffer()) as unknown as Uint8Array;
  return Uint8Array.from(written);
}

function upload(
  url: string,
  cookie: string,
  bytes: Uint8Array<ArrayBuffer>,
  type: string,
) {
  return new Request(url, {
    method: "POST",
    headers: { cookie, "content-type": type },
    body: bytes,
  });
}

describe("Labour register (CM-205 – CM-207)", () => {
  it("adds a Labour with an opening balance posted to the ledger", async () => {
    const company = await ownerWithCompany();
    const { tower, mason, supervisor } = await fixtures(company);
    const labour = await created(
      company.cookie,
      labourBody(tower, {
        labourCode: "L-001",
        openingBalance: 150_000,
        aadhaar: "2341 2341 2346",
        contactNumber: "77081 65767",
        labourCategoryId: mason,
        supervisorId: supervisor,
        uanNumber: "100123456789",
      }),
    );
    expect(labour).toMatchObject({
      name: "Dhuresh Nawin",
      labourCode: "L-001",
      wageType: "daily",
      wagePerDay: 70_000,
      wagePerMonth: null,
      workingHoursPerDay: "8",
      openingBalance: 150_000,
      balance: 150_000,
      aadhaarMasked: "XXXXXXXX2346",
      contactNumber: "+917708165767",
      currentProject: { id: tower },
      labourCategory: { id: mason },
      supervisor: { id: supervisor },
      isActive: true,
    });
    const entries = await openingEntries(labour.id);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      kind: "opening",
      amount: 150_000,
      sourceType: "labour",
      sourceId: labour.id,
      projectId: null,
    });
    expect(entries[0]?.entryDate.toISOString().slice(0, 10)).toBe("2026-09-01");
    const row = await prisma.constructionLabourLabour.findUniqueOrThrow({
      where: { id: labour.id },
    });
    expect(row.aadhaarEncrypted).not.toContain(VALID_AADHAAR);
    expect(row.aadhaarLast4).toBe("2346");

    const history = await json<{
      items: {
        fromProject: unknown;
        toProject: { id: string };
        transferDate: string;
      }[];
    }>(
      await listTransfers(
        jsonRequest(`${BASE}/${labour.id}/transfers`, company.cookie),
        params(labour.id),
      ),
    );
    expect(history.items).toEqual([
      expect.objectContaining({
        fromProject: null,
        toProject: expect.objectContaining({ id: tower }) as unknown,
        transferDate: "2026-09-01",
      }),
    ]);
  });

  it("reverses the old opening entry when the balance or joining date changes", async () => {
    const company = await ownerWithCompany();
    const { tower } = await fixtures(company);
    const labour = await created(
      company.cookie,
      labourBody(tower, { openingBalance: 50_000 }),
    );

    const changed = await update(company.cookie, labour, {
      openingBalance: -20_000,
    });
    expect(changed.status).toBe(StatusCodes.OK);
    const after = await json<Labour>(changed);
    expect(after.openingBalance).toBe(-20_000);
    expect(after.balance).toBe(-20_000);
    expect(after.wagePerDay).toBe(70_000);

    let entries = await openingEntries(labour.id);
    expect(entries.map((entry) => entry.amount)).toEqual([
      50_000, -50_000, -20_000,
    ]);
    expect(entries[1]?.reversesEntryId).toBe(entries[0]?.id);

    const moved = await update(company.cookie, after, {
      joiningDate: "2026-08-15",
    });
    expect(moved.status).toBe(StatusCodes.OK);
    entries = await openingEntries(labour.id);
    expect(entries).toHaveLength(5);
    expect(entries.at(-1)?.entryDate.toISOString().slice(0, 10)).toBe(
      "2026-08-15",
    );
    expect((await json<Labour>(moved)).openingBalance).toBe(-20_000);
    const first = await prisma.constructionLabourTransfer.findFirstOrThrow({
      where: { labourId: labour.id },
    });
    expect(first.transferDate.toISOString().slice(0, 10)).toBe("2026-08-15");

    const stale = await update(company.cookie, labour, { name: "Old copy" });
    expect(stale.status).toBe(StatusCodes.CONFLICT);
    expect(await codeOf(stale)).toBe("LABOUR_CHANGED");
  });

  it("switches wage type and clears the other wage", async () => {
    const company = await ownerWithCompany();
    const { tower } = await fixtures(company);
    const labour = await created(company.cookie, labourBody(tower));
    const missing = await update(company.cookie, labour, {
      wageType: "monthly",
    });
    expect(missing.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await codeOf(missing)).toBe("WAGE_REQUIRED");
    const monthly = await json<Labour>(
      await update(company.cookie, labour, {
        wageType: "monthly",
        wagePerMonth: 18_00_000,
      }),
    );
    expect(monthly).toMatchObject({
      wageType: "monthly",
      wagePerMonth: 18_00_000,
      wagePerDay: null,
    });
  });

  it("keeps working hours a day: 8 by default, kept when an edit leaves them out, shown without Financial", async () => {
    const company = await ownerWithCompany();
    const { tower } = await fixtures(company);
    const labour = await created(
      company.cookie,
      labourBody(tower, { workingHoursPerDay: "9.50" }),
    );
    expect(labour.workingHoursPerDay).toBe("9.5");
    const row = await prisma.constructionLabourLabour.findUniqueOrThrow({
      where: { id: labour.id },
    });
    expect(row.workingHoursPerDay.toString()).toBe("9.5");

    const renamed = await json<Labour>(
      await update(company.cookie, labour, { name: "Dhuresh P" }),
    );
    expect(renamed.workingHoursPerDay).toBe("9.5");
    const cleared = await json<Labour>(
      await update(company.cookie, renamed, { workingHoursPerDay: null }),
    );
    expect(cleared.workingHoursPerDay).toBe("9.5");
    const changed = await json<Labour>(
      await update(company.cookie, cleared, { workingHoursPerDay: 12 }),
    );
    expect(changed.workingHoursPerDay).toBe("12");
    const invalid = await update(company.cookie, changed, {
      workingHoursPerDay: "25",
    });
    expect(invalid.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await codeOf(invalid)).toBe("WORKING_HOURS_INVALID");

    const clerk = await memberOn(
      company,
      { "masters.labours": ["read"], "labour.attendance": ["read"] },
      [tower],
    );
    expect((await get(clerk.cookie, labour.id)).workingHoursPerDay).toBe("12");
    const options = await json<{
      items: { id: string; workingHoursPerDay: string; wagePerDay: unknown }[];
    }>(
      await labourOptions(
        jsonRequest(
          `${BASE}/options?projectId=${tower}&date=2026-10-01`,
          clerk.cookie,
        ),
      ),
    );
    expect(options.items).toEqual([
      expect.objectContaining({
        id: labour.id,
        workingHoursPerDay: "12",
        wagePerDay: null,
      }),
    ]);
  });

  it("validates fields, references and the Labour Id", async () => {
    const company = await ownerWithCompany();
    const { tower, welder } = await fixtures(company);
    const cases: [Record<string, unknown>, string][] = [
      [{ name: " " }, "LABOUR_NAME_REQUIRED"],
      [{ wagePerDay: 0 }, "WAGE_REQUIRED"],
      [{ uanNumber: "123" }, "UAN_INVALID"],
      [{ esicNumber: "12345" }, "ESIC_INVALID"],
      [{ aadhaar: "234123412345" }, "AADHAAR_INVALID"],
      [{ contactNumber: "12345" }, "MOBILE_INVALID"],
      [{ weeklyHolidays: [1, 1] }, "WEEKLY_HOLIDAYS_INVALID"],
      [{ joiningDate: "2026-13-01" }, "JOINING_DATE_INVALID"],
      [{ currentProjectId: newId() }, "PROJECT_NOT_FOUND"],
      [{ labourCategoryId: welder }, "LABOUR_CATEGORY_NOT_FOUND"],
      [{ supervisorId: newId() }, "SUPERVISOR_NOT_FOUND"],
    ];
    for (const [extra, code] of cases) {
      const response = await create(company.cookie, labourBody(tower, extra));
      expect([StatusCodes.BAD_REQUEST, StatusCodes.NOT_FOUND]).toContain(
        response.status,
      );
      expect(await codeOf(response)).toBe(code);
    }

    await created(company.cookie, labourBody(tower, { labourCode: "M-7" }));
    const clash = await create(
      company.cookie,
      labourBody(tower, { labourCode: "m-7" }),
    );
    expect(clash.status).toBe(StatusCodes.CONFLICT);
    expect(await codeOf(clash)).toBe("LABOUR_CODE_TAKEN");
  });

  it("nulls amounts for a Team Member without Financial and refuses one without the menu", async () => {
    const company = await ownerWithCompany();
    const { tower } = await fixtures(company);
    const labour = await created(
      company.cookie,
      labourBody(tower, { openingBalance: 30_000 }),
    );
    const clerk = await memberOn(company, {
      "masters.labours": ["read", "update"],
    });
    const seen = await get(clerk.cookie, labour.id);
    expect(seen).toMatchObject({
      wagePerDay: null,
      wagePerMonth: null,
      overtimeWagePerHour: null,
      openingBalance: null,
      balance: null,
    });
    // Omitted amounts are kept.
    const renamed = await update(clerk.cookie, seen, { name: "Dhuresh P." });
    expect(renamed.status).toBe(StatusCodes.OK);
    const owner = await get(company.cookie, labour.id);
    expect(owner).toMatchObject({
      name: "Dhuresh P.",
      wagePerDay: 70_000,
      openingBalance: 30_000,
    });

    const outsider = await memberOn(company, { "masters.vendors": ["read"] });
    expect((await listLabours(jsonRequest(BASE, outsider.cookie))).status).toBe(
      StatusCodes.FORBIDDEN,
    );
    expect((await create(outsider.cookie, labourBody(tower))).status).toBe(
      StatusCodes.FORBIDDEN,
    );
  });

  it("lists with filters and pages", async () => {
    const company = await ownerWithCompany();
    const { tower, villa, mason, supervisor } = await fixtures(company);
    const a = await created(
      company.cookie,
      labourBody(tower, { name: "Anbu", labourCategoryId: mason }),
    );
    const b = await created(
      company.cookie,
      labourBody(villa, { name: "Bhim", supervisorId: supervisor }),
    );
    await created(company.cookie, labourBody(tower, { name: "Chetan" }));
    await deactivateLabour(
      jsonRequest(`${BASE}/${a.id}/deactivate`, company.cookie, {}),
      params(a.id),
    );

    type Page = {
      items: Labour[];
      total: number;
      nextCursor: string | null;
      prevCursor: string | null;
    };
    const page = async (query: string) =>
      json<Page>(
        await listLabours(jsonRequest(`${BASE}?${query}`, company.cookie)),
      );

    expect((await page("")).total).toBe(3);
    expect(
      (await page(`projectId=${tower}`)).items.map((item) => item.name),
    ).toEqual(["Chetan", "Anbu"]);
    expect((await page("active=false")).items.map((item) => item.id)).toEqual([
      a.id,
    ]);
    expect((await page("q=bhi")).items.map((item) => item.id)).toEqual([b.id]);
    expect(
      (await page(`categoryId=${mason}`)).items.map((item) => item.id),
    ).toEqual([a.id]);
    expect(
      (await page(`supervisorId=${supervisor}`)).items.map((item) => item.id),
    ).toEqual([b.id]);

    const first = await page("limit=2");
    expect(first.items).toHaveLength(2);
    expect(first.prevCursor).toBeNull();
    const second = await page(`limit=2&after=${first.nextCursor ?? ""}`);
    expect(second.items.map((item) => item.name)).toEqual(["Anbu"]);
    expect(second.nextCursor).toBeNull();
    const back = await page(`limit=2&before=${second.prevCursor ?? ""}`);
    expect(back.items.map((item) => item.id)).toEqual(
      first.items.map((item) => item.id),
    );
  });

  it("transfers one or many Labours, with history and date rules", async () => {
    const company = await ownerWithCompany();
    const { tower, villa } = await fixtures(company);
    const dhuresh = await created(company.cookie, labourBody(tower));
    const shyam = await created(
      company.cookie,
      labourBody(tower, { name: "Shyam" }),
    );
    const transfer = (cookie: string, body: Record<string, unknown>) =>
      transferLabours(jsonRequest(`${BASE}/transfer`, cookie, body));

    const same = await transfer(company.cookie, {
      labourIds: [dhuresh.id],
      toProjectId: tower,
      transferDate: "2026-10-01",
    });
    expect(same.status).toBe(StatusCodes.CONFLICT);
    expect(await codeOf(same)).toBe("TRANSFER_SAME_PROJECT");

    await markAttendance(company.workspaceId, dhuresh.id, tower, "2026-10-03");
    const early = await transfer(company.cookie, {
      labourIds: [dhuresh.id, shyam.id],
      toProjectId: villa,
      transferDate: "2026-10-03",
    });
    expect(early.status).toBe(StatusCodes.CONFLICT);
    expect(await codeOf(early)).toBe("TRANSFER_BEFORE_ATTENDANCE");
    // All or none: Shyam did not move either.
    expect((await get(company.cookie, shyam.id)).currentProject.id).toBe(tower);

    const moved = await transfer(company.cookie, {
      labourIds: [dhuresh.id, shyam.id],
      toProjectId: villa,
      transferDate: "2026-10-04",
      remark: "Slab work",
    });
    expect(moved.status).toBe(StatusCodes.OK);
    const body = await json<{ items: Labour[] }>(moved);
    expect(body.items.map((item) => item.currentProject.id)).toEqual([
      villa,
      villa,
    ]);

    const back = await transfer(company.cookie, {
      labourIds: [shyam.id],
      toProjectId: tower,
      transferDate: "2026-10-02",
    });
    expect(await codeOf(back)).toBe("TRANSFER_BEFORE_LAST_TRANSFER");

    const history = await json<{
      items: {
        fromProject: { id: string } | null;
        toProject: { id: string; name: string };
        transferDate: string;
        remark: string | null;
      }[];
    }>(
      await listTransfers(
        jsonRequest(`${BASE}/${dhuresh.id}/transfers`, company.cookie),
        params(dhuresh.id),
      ),
    );
    expect(history.items).toHaveLength(2);
    expect(history.items[1]).toMatchObject({
      fromProject: { id: tower },
      toProject: { id: villa },
      transferDate: "2026-10-04",
      remark: "Slab work",
    });

    // The Project on a date follows the history (attendance pickers).
    type Options = { items: { id: string; wagePerDay: number | null }[] };
    const options = async (projectId: string, date: string) =>
      (
        await json<Options>(
          await labourOptions(
            jsonRequest(
              `${BASE}/options?projectId=${projectId}&date=${date}`,
              company.cookie,
            ),
          ),
        )
      ).items.map((item) => item.id);
    expect(await options(tower, "2026-10-03")).toEqual([dhuresh.id, shyam.id]);
    expect(await options(villa, "2026-10-03")).toEqual([]);
    expect(await options(villa, "2026-10-04")).toEqual([dhuresh.id, shyam.id]);
    expect(await options(tower, "2026-08-01")).toEqual([]);
  });

  it("needs Labour transfer on the destination and every source Project", async () => {
    const company = await ownerWithCompany();
    const { tower, villa } = await fixtures(company);
    const labour = await created(company.cookie, labourBody(tower));
    const onlyVilla = await memberOn(
      company,
      { "labour.labour": ["read", "transfer"] },
      [villa],
    );
    const refused = await transferLabours(
      jsonRequest(`${BASE}/transfer`, onlyVilla.cookie, {
        labourIds: [labour.id],
        toProjectId: villa,
        transferDate: "2026-10-01",
      }),
    );
    expect(refused.status).toBe(StatusCodes.FORBIDDEN);

    const both = await memberOn(
      company,
      { "labour.labour": ["read", "transfer"], "labour.attendance": ["read"] },
      [villa, tower],
    );
    const allowed = await transferLabours(
      jsonRequest(`${BASE}/transfer`, both.cookie, {
        labourIds: [labour.id],
        toProjectId: villa,
        transferDate: "2026-10-01",
      }),
    );
    expect(allowed.status).toBe(StatusCodes.OK);

    // Options: attendance read on that Project; no Financial → no rates.
    const options = await labourOptions(
      jsonRequest(
        `${BASE}/options?projectId=${villa}&date=2026-10-02`,
        both.cookie,
      ),
    );
    expect(options.status).toBe(StatusCodes.OK);
    expect(
      (await json<{ items: { wagePerDay: number | null }[] }>(options)).items,
    ).toEqual([expect.objectContaining({ wagePerDay: null })]);
    expect(
      (
        await labourOptions(
          jsonRequest(`${BASE}/options?projectId=${villa}`, onlyVilla.cookie),
        )
      ).status,
    ).toBe(StatusCodes.FORBIDDEN);
  });

  it("deactivates, activates and deletes only without records", async () => {
    const company = await ownerWithCompany();
    const { tower } = await fixtures(company);
    const kept = await created(
      company.cookie,
      labourBody(tower, { openingBalance: 10_000 }),
    );
    const inactive = await json<Labour>(
      await deactivateLabour(
        jsonRequest(`${BASE}/${kept.id}/deactivate`, company.cookie, {}),
        params(kept.id),
      ),
    );
    expect(inactive.isActive).toBe(false);
    const active = await json<Labour>(
      await activateLabour(
        jsonRequest(`${BASE}/${kept.id}/activate`, company.cookie, {}),
        params(kept.id),
      ),
    );
    expect(active.isActive).toBe(true);

    await markAttendance(company.workspaceId, kept.id, tower, "2026-09-10");
    const blocked = await deleteLabour(
      jsonRequest(`${BASE}/${kept.id}/delete`, company.cookie, {}),
      params(kept.id),
    );
    expect(blocked.status).toBe(StatusCodes.CONFLICT);
    expect(await codeOf(blocked)).toBe("LABOUR_HAS_RECORDS");

    const fresh = await created(
      company.cookie,
      labourBody(tower, {
        name: "Temp",
        openingBalance: 5_000,
        labourCode: "T-1",
      }),
    );
    const deleted = await deleteLabour(
      jsonRequest(`${BASE}/${fresh.id}/delete`, company.cookie, {}),
      params(fresh.id),
    );
    expect(deleted.status).toBe(StatusCodes.NO_CONTENT);
    const gone = await getLabour(
      jsonRequest(`${BASE}/${fresh.id}`, company.cookie),
      params(fresh.id),
    );
    expect(gone.status).toBe(StatusCodes.NOT_FOUND);
    const entries = await openingEntries(fresh.id);
    expect(entries.reduce((sum, entry) => sum + entry.amount, 0)).toBe(0);
    // The Labour Id is free again.
    await created(company.cookie, labourBody(tower, { labourCode: "T-1" }));
  });

  it("keeps Companies apart", async () => {
    const first = await ownerWithCompany();
    const second = await ownerWithCompany("Sakthi Constructions");
    const { tower } = await fixtures(first);
    const theirs = await fixtures(second);
    const labour = await created(first.cookie, labourBody(tower));
    const peek = await getLabour(
      jsonRequest(`${BASE}/${labour.id}`, second.cookie),
      params(labour.id),
    );
    expect(peek.status).toBe(StatusCodes.NOT_FOUND);
    const list = await json<{ total: number }>(
      await listLabours(jsonRequest(BASE, second.cookie)),
    );
    expect(list.total).toBe(0);
    // Another Company's Project is not found.
    const foreign = await create(second.cookie, labourBody(tower));
    expect(await codeOf(foreign)).toBe("PROJECT_NOT_FOUND");
    const move = await transferLabours(
      jsonRequest(`${BASE}/transfer`, second.cookie, {
        labourIds: [labour.id],
        toProjectId: theirs.tower,
        transferDate: "2026-10-01",
      }),
    );
    expect(move.status).toBe(StatusCodes.NOT_FOUND);
  });

  it("imports from the sample sheet: preview with errors, then all or nothing", async () => {
    const company = await ownerWithCompany();
    const { tower, mason, suffix } = await fixtures(company);
    await created(company.cookie, labourBody(tower, { labourCode: "DB-1" }));

    const templateResponse = await importTemplate(
      jsonRequest(`${BASE}/import-template`, company.cookie),
    );
    expect(templateResponse.status).toBe(StatusCodes.OK);
    expect(templateResponse.headers.get("content-type")).toBe(XLSX);
    const template = await workbookOf(templateResponse);
    const sheet = template.getWorksheet("Labours");
    const lists = template.getWorksheet("Lists");
    expect(sheet?.getRow(1).getCell(1).value).toBe("Labour Name*");
    expect(sheet?.getRow(2).getCell(1).value).toBe("Dhuresh Nawin");
    const listed: unknown[] = [];
    lists?.getColumn(1).eachCell((cell) => listed.push(cell.value));
    expect(listed).toContain(`Tower A ${suffix}`);

    if (sheet == null) throw new Error("No Labours sheet");
    const headers: string[] = [];
    sheet.getRow(1).eachCell((cell) => headers.push(cell.text));
    const column = (header: string) => headers.indexOf(header) + 1;
    const fill = (
      row: number,
      values: Record<string, string | number | Date>,
    ) => {
      sheet.getRow(row).values = [];
      for (const [header, value] of Object.entries(values))
        sheet.getRow(row).getCell(column(header)).value = value;
    };
    const good = {
      "Labour Name*": "Ganesh",
      "Joining Date*": new Date("2026-09-01T00:00:00Z"),
      "Wage Type*": "Daily",
      "Wage per Day (₹)": 650,
      "Overtime Wage per Hour (₹)*": 80.5,
      "Weekly Holidays": "Sun, Sat",
      "Opening Balance (₹)": -1500,
      "Project*": `tower a ${suffix}`,
      "Labour Category": `Mason ${suffix}`,
      "Labour Id": "IMP-1",
      "Working Hours per Day": 9,
    };
    fill(2, good);
    fill(3, {
      "Labour Name*": "",
      "Joining Date*": "31/02/2026",
      "Wage Type*": "Daily",
      "Overtime Wage per Hour (₹)*": 50,
      "Project*": "Nowhere",
      "Labour Id": "DB-1",
    });
    fill(4, { ...good, "Labour Name*": "Manikandan", "Labour Id": "imp-1" });
    const bytes = await xlsxBytes(template);

    const preview = await importLabours(
      upload(`${BASE}/import?dryRun=true`, company.cookie, bytes, XLSX),
    );
    expect(preview.status).toBe(StatusCodes.OK);
    type Preview = {
      rows: {
        row: number;
        ok: boolean;
        errors: { field: string; code: string }[];
        values: { wagePerDay: number | null };
      }[];
      valid: number;
      invalid: number;
      imported: number;
    };
    const body = await json<Preview>(preview);
    expect(body).toMatchObject({ valid: 0, invalid: 3, imported: 0 });
    const codes = body.rows.map((row) =>
      row.errors.map((error) => error.code).sort(),
    );
    expect(codes[0]).toEqual(["LABOUR_CODE_DUPLICATE"]);
    expect(codes[1]).toEqual(
      expect.arrayContaining([
        "LABOUR_NAME_REQUIRED",
        "JOINING_DATE_INVALID",
        "WAGE_REQUIRED",
        "PROJECT_NOT_FOUND",
        "LABOUR_CODE_TAKEN",
      ]),
    );
    expect(body.rows[0]?.values.wagePerDay).toBe(65_000);

    const refused = await importLabours(
      upload(`${BASE}/import?dryRun=false`, company.cookie, bytes, XLSX),
    );
    expect(refused.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await codeOf(refused)).toBe("IMPORT_HAS_ERRORS");
    expect(
      await prisma.constructionLabourLabour.count({
        where: { workspaceId: company.workspaceId },
      }),
    ).toBe(1);

    sheet.spliceRows(3, 2);
    // Blank working hours are 8.
    const { "Working Hours per Day": _hours, ...noHours } = good;
    fill(3, { ...noHours, "Labour Name*": "Manikandan", "Labour Id": "IMP-2" });
    const fixed = await xlsxBytes(template);
    const imported = await importLabours(
      upload(`${BASE}/import?dryRun=false`, company.cookie, fixed, XLSX),
    );
    expect(imported.status).toBe(StatusCodes.CREATED);
    expect(await json<Preview>(imported)).toMatchObject({
      valid: 2,
      imported: 2,
    });
    const list = await json<{ items: Labour[] }>(
      await listLabours(jsonRequest(`${BASE}?q=IMP`, company.cookie)),
    );
    expect(list.items).toHaveLength(2);
    expect(
      list.items.map((item) => [item.name, item.workingHoursPerDay]).sort(),
    ).toEqual([
      ["Ganesh", "9"],
      ["Manikandan", "8"],
    ]);
    expect(list.items[0]).toMatchObject({
      wagePerDay: 65_000,
      overtimeWagePerHour: 8_050,
      weeklyHolidays: [0, 6],
      openingBalance: -150_000,
      labourCategory: { id: mason },
      currentProject: { id: tower },
    });

    const garbage = await importLabours(
      upload(`${BASE}/import`, company.cookie, pngBytes(), XLSX),
    );
    expect(await codeOf(garbage)).toBe("IMPORT_FILE_INVALID");
  });

  it("exports the filtered register; amounts only with Financial", async () => {
    const company = await ownerWithCompany();
    const { tower, villa } = await fixtures(company);
    await created(
      company.cookie,
      labourBody(tower, { name: "Tower man", aadhaar: VALID_AADHAAR }),
    );
    await created(company.cookie, labourBody(villa, { name: "Villa man" }));

    const response = await exportLabours(
      jsonRequest(`${BASE}/export?projectId=${tower}`, company.cookie),
    );
    expect(response.status).toBe(StatusCodes.OK);
    const sheet = (await workbookOf(response)).getWorksheet("Labours");
    expect(sheet?.rowCount).toBe(2);
    const headers: string[] = [];
    sheet?.getRow(1).eachCell((cell) => headers.push(cell.text));
    const cell = (header: string) =>
      sheet?.getRow(2).getCell(headers.indexOf(header) + 1).value;
    expect(cell("Labour Name")).toBe("Tower man");
    expect(cell("Wage per Day (₹)")).toBe(700);
    expect(cell("Aadhaar Number")).toBe("XXXXXXXX2346");
    expect(cell("Working Hours per Day")).toBe(8);

    const clerk = await memberOn(company, { "masters.labours": ["read"] });
    const hidden = (
      await workbookOf(
        await exportLabours(jsonRequest(`${BASE}/export`, clerk.cookie)),
      )
    ).getWorksheet("Labours");
    expect(hidden?.rowCount).toBe(3);
    expect(
      hidden?.getRow(2).getCell(headers.indexOf("Wage per Day (₹)") + 1).value,
    ).toBeNull();
    // Working hours are not an amount.
    expect(
      hidden?.getRow(2).getCell(headers.indexOf("Working Hours per Day") + 1)
        .value,
    ).toBe(8);
  });

  it("keeps a photo and documents", async () => {
    const company = await ownerWithCompany();
    const { tower } = await fixtures(company);
    const labour = await created(company.cookie, labourBody(tower));
    const url = `${BASE}/${labour.id}`;

    const wrong = await setPhoto(
      upload(`${url}/photo`, company.cookie, gifBytes(), "image/gif"),
      params(labour.id),
    );
    expect(await codeOf(wrong)).toBe("FILE_TYPE_NOT_ALLOWED");
    const photo = await setPhoto(
      upload(`${url}/photo`, company.cookie, pngBytes(), "image/png"),
      params(labour.id),
    );
    expect(photo.status).toBe(StatusCodes.OK);
    const { photoUrl } = await json<{ photoUrl: string }>(photo);
    expect(photoUrl).toMatch(
      new RegExp(`^/api/construction/labour/labours/${labour.id}/photo\\?v=`),
    );
    expect((await get(company.cookie, labour.id)).photoUrl).toBe(photoUrl);
    const streamed = await getPhoto(
      jsonRequest(`${url}/photo`, company.cookie),
      params(labour.id),
    );
    expect(streamed.headers.get("content-type")).toBe("image/png");
    expect(await bytesOf(streamed)).toEqual(pngBytes());
    expect(
      await prisma.constructionOrganizationStoredFile.count({
        where: {
          workspaceId: company.workspaceId,
          kind: "labour_photo",
          deletedAt: null,
        },
      }),
    ).toBe(1);
    await removePhoto(
      jsonRequest(`${url}/photo/remove`, company.cookie, {}),
      params(labour.id),
    );
    expect((await get(company.cookie, labour.id)).photoUrl).toBeNull();

    const pdf = Uint8Array.from(
      new TextEncoder().encode("%PDF-1.7\nhello\n%%EOF"),
    );
    const added = await addDocument(
      upload(
        `${url}/documents?fileName=${encodeURIComponent("Aadhaar card.pdf")}`,
        company.cookie,
        pdf,
        "application/pdf",
      ),
      params(labour.id),
    );
    expect(added.status).toBe(StatusCodes.CREATED);
    const document = await json<{
      id: string;
      fileName: string;
      url: string;
      bytes: number;
    }>(added);
    expect(document).toMatchObject({
      fileName: "Aadhaar card.pdf",
      bytes: pdf.byteLength,
    });
    const listed = await json<{ items: { id: string }[] }>(
      await listDocuments(
        jsonRequest(`${url}/documents`, company.cookie),
        params(labour.id),
      ),
    );
    expect(listed.items.map((item) => item.id)).toEqual([document.id]);
    const file = await getDocument(
      jsonRequest(`${TEST_ORIGIN}${document.url}`, company.cookie),
      docParams(labour.id, document.id),
    );
    expect(file.headers.get("content-type")).toBe("application/pdf");
    expect(file.headers.get("content-disposition")).toContain("attachment");
    expect(await bytesOf(file)).toEqual(pdf);

    const reader = await memberOn(company, { "masters.labours": ["read"] });
    expect(
      (
        await deleteDocument(
          jsonRequest(
            `${url}/documents/${document.id}/delete`,
            reader.cookie,
            {},
          ),
          docParams(labour.id, document.id),
        )
      ).status,
    ).toBe(StatusCodes.FORBIDDEN);
    const removed = await deleteDocument(
      jsonRequest(`${url}/documents/${document.id}/delete`, company.cookie, {}),
      docParams(labour.id, document.id),
    );
    expect(removed.status).toBe(StatusCodes.NO_CONTENT);
    expect(
      (
        await getDocument(
          jsonRequest(`${TEST_ORIGIN}${document.url}`, company.cookie),
          docParams(labour.id, document.id),
        )
      ).status,
    ).toBe(StatusCodes.NOT_FOUND);

    const other = await ownerWithCompany("Sakthi Constructions");
    expect(
      (
        await listDocuments(
          jsonRequest(`${url}/documents`, other.cookie),
          params(labour.id),
        )
      ).status,
    ).toBe(StatusCodes.NOT_FOUND);
  });

  it("is listed in OpenAPI", async () => {
    const document = await json<{
      paths: Record<string, Record<string, unknown>>;
    }>(getOpenApi());
    const paths = [
      ["/api/construction/labour/labours", "get"],
      ["/api/construction/labour/labours", "post"],
      ["/api/construction/labour/labours/options", "get"],
      ["/api/construction/labour/labours/transfer", "post"],
      ["/api/construction/labour/labours/import-template", "get"],
      ["/api/construction/labour/labours/import", "post"],
      ["/api/construction/labour/labours/export", "get"],
      ["/api/construction/labour/labours/{id}", "get"],
      ["/api/construction/labour/labours/{id}/update", "post"],
      ["/api/construction/labour/labours/{id}/activate", "post"],
      ["/api/construction/labour/labours/{id}/deactivate", "post"],
      ["/api/construction/labour/labours/{id}/delete", "post"],
      ["/api/construction/labour/labours/{id}/transfers", "get"],
      ["/api/construction/labour/labours/{id}/photo", "get"],
      ["/api/construction/labour/labours/{id}/photo", "post"],
      ["/api/construction/labour/labours/{id}/photo/remove", "post"],
      ["/api/construction/labour/labours/{id}/documents", "get"],
      ["/api/construction/labour/labours/{id}/documents", "post"],
      ["/api/construction/labour/labours/{id}/documents/{docId}", "get"],
      [
        "/api/construction/labour/labours/{id}/documents/{docId}/delete",
        "post",
      ],
    ] as const;
    for (const [path, method] of paths)
      expect(document.paths[path]?.[method], `${method} ${path}`).toBeDefined();
  });
});
