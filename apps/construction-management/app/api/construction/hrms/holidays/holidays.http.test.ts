import { randomUUID } from "node:crypto";

import { prisma } from "@repo/construction-db";
import ExcelJS from "exceljs";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it } from "vitest";

import { GET as getOpenApi } from "@/app/api/openapi.json/route";
import { createHrmsPorts } from "@/src/hrms/infrastructure/create-hrms-ports";
import { readHolidaySheet } from "@/src/hrms/infrastructure/holiday-workbook";
import { addDays, todayIn } from "@/src/shared-kernel/calendar-date";
import { jsonRequest, memberWith, ownerWithCompany } from "@/test/companies";
import { bytesOf } from "@/test/files";
import { TEST_ORIGIN } from "@/test/sessions";

import { POST as deleteHoliday } from "./[id]/delete/route";
import { POST as updateHoliday } from "./[id]/update/route";
import { POST as importHolidays } from "./import/route";
import { GET as listHolidays, POST as createHoliday } from "./route";
import { GET as sampleSheet } from "./sample/route";

const BASE = `${TEST_ORIGIN}/api/construction/hrms/holidays`;
const XLSX =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

type Holiday = {
  id: string;
  name: string;
  date: string;
  type: string;
  isOptional: boolean;
  description: string | null;
  updatedAt: string;
};

type Preview = {
  rows: {
    row: number;
    ok: boolean;
    errors: { field: string; code: string }[];
    values: { name: string; date: string | null };
  }[];
  valid: number;
  invalid: number;
  imported: number;
};

const DIWALI = {
  name: "Diwali",
  date: "2030-10-26",
  type: "festival",
  isOptional: false,
  description: "Lakshmi Puja",
};

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });
const create = (cookie: string, body: unknown) =>
  createHoliday(jsonRequest(BASE, cookie, body));
const list = (cookie: string, year: number | string) =>
  listHolidays(jsonRequest(`${BASE}?year=${String(year)}`, cookie));
const update = (cookie: string, id: string, body: unknown) =>
  updateHoliday(jsonRequest(`${BASE}/${id}/update`, cookie, body), params(id));
const remove = (cookie: string, id: string) =>
  deleteHoliday(jsonRequest(`${BASE}/${id}/delete`, cookie, {}), params(id));

function upload(cookie: string, bytes: Uint8Array, dryRun: boolean) {
  return importHolidays(
    new Request(`${BASE}/import?dryRun=${String(dryRun)}`, {
      method: "POST",
      headers: { "content-type": XLSX, cookie },
      body: Uint8Array.from(bytes),
    }),
  );
}

async function sheet(
  rows: (string | number | Date | null)[][],
  headers = ["Holiday Name*", "Date*", "Type*", "Optional", "Description"],
): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Holidays");
  worksheet.addRow(headers);
  for (const row of rows) worksheet.addRow(row);
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

describe("Holidays HTTP (CM-305)", () => {
  it("is 401 without a Session", async () => {
    expect((await listHolidays(new Request(`${BASE}?year=2026`))).status).toBe(
      StatusCodes.UNAUTHORIZED,
    );
  });

  it("adds, lists by year, edits and deletes a holiday, audited", async () => {
    const owner = await ownerWithCompany();
    const created = await create(owner.cookie, DIWALI);
    expect(created.status).toBe(StatusCodes.CREATED);
    const diwali = await json<Holiday>(created);
    expect(diwali).toMatchObject({ ...DIWALI });
    await create(owner.cookie, {
      name: "New Year",
      date: "2031-01-01",
      type: "company",
      isOptional: true,
    });

    const year = await json<{ year: number; items: Holiday[] }>(
      await list(owner.cookie, 2030),
    );
    expect(year.year).toBe(2030);
    expect(year.items.map((item) => item.name)).toEqual(["Diwali"]);

    const edited = await update(owner.cookie, diwali.id, {
      ...DIWALI,
      isOptional: true,
      description: null,
      expectedUpdatedAt: diwali.updatedAt,
    });
    expect(edited.status).toBe(StatusCodes.OK);
    expect(await json(edited)).toMatchObject({
      isOptional: true,
      description: null,
    });
    const stale = await update(owner.cookie, diwali.id, {
      ...DIWALI,
      expectedUpdatedAt: diwali.updatedAt,
    });
    expect(stale.status).toBe(StatusCodes.CONFLICT);
    expect(await json(stale)).toMatchObject({ code: "HOLIDAY_CHANGED" });

    expect((await remove(owner.cookie, diwali.id)).status).toBe(
      StatusCodes.NO_CONTENT,
    );
    expect(
      (await json<{ items: Holiday[] }>(await list(owner.cookie, 2030))).items,
    ).toEqual([]);
    // The date is free again.
    expect((await create(owner.cookie, DIWALI)).status).toBe(
      StatusCodes.CREATED,
    );
    const actions = (
      await prisma.constructionOrganizationAuditEvent.findMany({
        where: { workspaceId: owner.workspaceId, entityId: diwali.id },
        orderBy: { occurredAt: "asc" },
      })
    ).map((event) => event.action);
    expect(actions).toEqual([
      "hrms_holiday.created",
      "hrms_holiday.updated",
      "hrms_holiday.deleted",
    ]);
  });

  it("keeps one holiday per date and names the field at fault", async () => {
    const owner = await ownerWithCompany();
    await create(owner.cookie, DIWALI);
    const twin = await create(owner.cookie, { ...DIWALI, name: "Deepavali" });
    expect(twin.status).toBe(StatusCodes.CONFLICT);
    expect(await json(twin)).toMatchObject({
      code: "HOLIDAY_DATE_TAKEN",
      details: { field: "date" },
    });
    const name = await create(owner.cookie, {
      ...DIWALI,
      name: "x".repeat(81),
    });
    expect(name.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await json(name)).toMatchObject({
      code: "HOLIDAY_NAME_TOO_LONG",
      details: { field: "name" },
    });
    const date = await create(owner.cookie, { ...DIWALI, date: "2030-02-30" });
    expect(await json(date)).toMatchObject({ details: { field: "date" } });
    const type = await create(owner.cookie, { ...DIWALI, type: "bank" });
    expect(await json(type)).toMatchObject({ code: "VALIDATION_ERROR" });
    expect((await list(owner.cookie, "26")).status).toBe(
      StatusCodes.BAD_REQUEST,
    );
  });

  it("refuses a holiday older than the Back-dated Entry limit, but not for the Owner", async () => {
    const owner = await ownerWithCompany();
    await prisma.constructionOrganizationBackdatedEntryPolicy.create({
      data: {
        id: randomUUID(),
        workspaceId: owner.workspaceId,
        createDays: 0,
        createOverrideDesignationIds: [],
        editDays: 0,
        editOverrideDesignationIds: [],
        modules: {
          holiday: {
            mode: "custom",
            create: { days: 3, overrideDesignationIds: [] },
            edit: { days: 3, overrideDesignationIds: [] },
          },
        },
        createdBy: owner.userId,
        updatedBy: owner.userId,
      },
    });
    const editor = await memberWith(owner, {
      "hrms.holidays": ["create", "read", "update", "delete"],
    });
    const today = todayIn("Asia/Kolkata");
    const old = { ...DIWALI, date: addDays(today, -30) };
    const blocked = await create(editor.cookie, old);
    expect(blocked.status).toBe(StatusCodes.FORBIDDEN);
    expect(await json(blocked)).toMatchObject({
      code: "BACKDATED_CREATE_BLOCKED",
    });
    expect(
      (await create(editor.cookie, { ...DIWALI, date: addDays(today, -2) }))
        .status,
    ).toBe(StatusCodes.CREATED);
    const byOwner = await json<Holiday>(await create(owner.cookie, old));
    expect(byOwner.date).toBe(old.date);
    // Changing or deleting the old holiday is an edit of a back-dated entry.
    expect((await remove(editor.cookie, byOwner.id)).status).toBe(
      StatusCodes.FORBIDDEN,
    );
  });

  it("needs hrms.holidays and keeps each Company's holidays to itself", async () => {
    const owner = await ownerWithCompany();
    const diwali = await json<Holiday>(await create(owner.cookie, DIWALI));
    const reader = await memberWith(owner, { "hrms.holidays": ["read"] });
    expect((await list(reader.cookie, 2030)).status).toBe(StatusCodes.OK);
    for (const response of [
      await create(reader.cookie, { ...DIWALI, date: "2030-11-01" }),
      await remove(reader.cookie, diwali.id),
      await upload(reader.cookie, await sheet([]), true),
    ]) {
      expect(response.status).toBe(StatusCodes.FORBIDDEN);
      expect(await json(response)).toMatchObject({ code: "PERMISSION_DENIED" });
    }
    const nobody = await memberWith(owner, { "hrms.settings": ["read"] });
    expect((await list(nobody.cookie, 2030)).status).toBe(
      StatusCodes.FORBIDDEN,
    );

    const other = await ownerWithCompany("Other Builders");
    expect(
      (await json<{ items: Holiday[] }>(await list(other.cookie, 2030))).items,
    ).toEqual([]);
    expect(
      (
        await update(other.cookie, diwali.id, {
          ...DIWALI,
          expectedUpdatedAt: diwali.updatedAt,
        })
      ).status,
    ).toBe(StatusCodes.NOT_FOUND);
    expect((await remove(other.cookie, diwali.id)).status).toBe(
      StatusCodes.NOT_FOUND,
    );
    // Their own Diwali is theirs.
    expect((await create(other.cookie, DIWALI)).status).toBe(
      StatusCodes.CREATED,
    );
  });

  it("serves a sample that imports as it is", async () => {
    const owner = await ownerWithCompany();
    const sample = await sampleSheet(
      jsonRequest(`${BASE}/sample?year=2031`, owner.cookie),
    );
    expect(sample.status).toBe(StatusCodes.OK);
    expect(sample.headers.get("content-type")).toBe(XLSX);
    const bytes = await bytesOf(sample);
    const rows = await readHolidaySheet(bytes);
    expect(rows.map((row) => row.cells.name)).toEqual([
      "Republic Day",
      "Company Foundation Day",
    ]);
    const preview = await json<Preview>(
      await upload(owner.cookie, bytes, true),
    );
    expect(preview).toMatchObject({ valid: 2, invalid: 0, imported: 0 });
    const imported = await upload(owner.cookie, bytes, false);
    expect(imported.status).toBe(StatusCodes.CREATED);
    expect(await json(imported)).toMatchObject({ imported: 2 });
    const year = await json<{ items: Holiday[] }>(
      await list(owner.cookie, 2031),
    );
    expect(year.items).toMatchObject([
      { name: "Republic Day", date: "2031-01-26", type: "national" },
      {
        name: "Company Foundation Day",
        date: "2031-07-01",
        type: "company",
        isOptional: true,
      },
    ]);
  });

  it("previews row errors and imports all or nothing", async () => {
    const owner = await ownerWithCompany();
    await create(owner.cookie, DIWALI);
    const bad = await sheet([
      ["Pongal", "14/01/2030", "Festival", "No", null],
      ["", "2030-01-26", "National", null, null],
      ["Holi", "2030-03-31", "Bank", "Maybe", null],
      [
        "Diwali again",
        new Date("2030-10-26T00:00:00.000Z"),
        "Festival",
        null,
        null,
      ],
      ["Twin A", "2030-05-01", "Company", null, null],
      ["Twin B", "2030-05-01", "Company", null, null],
      ["Bad date", "31/02/2030", "Company", null, null],
    ]);
    const preview = await json<Preview>(await upload(owner.cookie, bad, true));
    expect(preview).toMatchObject({ valid: 1, invalid: 6, imported: 0 });
    const codes = preview.rows.map((row) => [
      row.row,
      row.errors.map((error) => `${error.field}:${error.code}`),
    ]);
    expect(codes).toEqual([
      [2, []],
      [3, ["name:HOLIDAY_NAME_REQUIRED"]],
      [4, ["type:HOLIDAY_TYPE_INVALID", "optional:HOLIDAY_OPTIONAL_INVALID"]],
      [5, ["date:HOLIDAY_DATE_TAKEN"]],
      [6, ["date:HOLIDAY_DATE_REPEATED"]],
      [7, ["date:HOLIDAY_DATE_REPEATED"]],
      [8, ["date:HOLIDAY_DATE_INVALID"]],
    ]);
    expect(preview.rows[0]?.values.date).toBe("2030-01-14");

    const refused = await upload(owner.cookie, bad, false);
    expect(refused.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await json(refused)).toMatchObject({
      code: "IMPORT_HAS_ERRORS",
      details: { valid: 1, invalid: 6 },
    });
    expect(
      (await json<{ items: Holiday[] }>(await list(owner.cookie, 2030))).items,
    ).toHaveLength(1);

    const good = await sheet([
      ["Pongal", "14/01/2030", "Festival", "No", null],
      ["May Day", "2030-05-01", "national", "yes", "Labour Day"],
    ]);
    const done = await upload(owner.cookie, good, false);
    expect(done.status).toBe(StatusCodes.CREATED);
    expect(await json(done)).toMatchObject({ imported: 2 });
    expect(
      (
        await json<{ items: Holiday[] }>(await list(owner.cookie, 2030))
      ).items.map((item) => item.name),
    ).toEqual(["Pongal", "May Day", "Diwali"]);
  });

  it("refuses a file that is not the sample workbook", async () => {
    const owner = await ownerWithCompany();
    const csv = await upload(
      owner.cookie,
      new TextEncoder().encode("Holiday Name,Date\nPongal,2030-01-14\n"),
      true,
    );
    expect(csv.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await json(csv)).toMatchObject({ code: "IMPORT_FILE_INVALID" });
    const headers = await upload(
      owner.cookie,
      await sheet([["Pongal", "2030-01-14"]], ["Festival", "When"]),
      true,
    );
    expect(await json(headers)).toMatchObject({ code: "IMPORT_FILE_INVALID" });
    const empty = await upload(owner.cookie, await sheet([]), true);
    expect(await json(empty)).toMatchObject({ code: "IMPORT_EMPTY" });
  });

  it("feeds the work calendar: holidays beat week offs, optional ones do not count", async () => {
    const owner = await ownerWithCompany();
    const member = await memberWith(owner, {});
    await create(owner.cookie, {
      name: "Independence Day",
      date: "2030-08-15",
      type: "national",
      isOptional: false,
    });
    await create(owner.cookie, {
      name: "Raksha Bandhan",
      date: "2030-08-13",
      type: "festival",
      isOptional: true,
    });
    await create(owner.cookie, {
      name: "Sunday Fair",
      date: "2030-08-18",
      type: "company",
      isOptional: false,
    });
    const { calendar } = createHrmsPorts();
    const days = (
      await calendar.monthFor(owner.workspaceId, [member.memberId], "2030-08")
    ).get(member.memberId);
    expect(days?.[14]).toMatchObject({
      date: "2030-08-15",
      kind: "holiday",
      holiday: { name: "Independence Day" },
    });
    expect(days?.[12]).toMatchObject({
      kind: "working",
      holiday: { name: "Raksha Bandhan", isOptional: true },
    });
    expect(days?.[17]?.kind).toBe("holiday"); // a Sunday
    expect(days?.[16]?.kind).toBe("week_off"); // Saturday, Settings
    expect(
      await calendar.isHoliday(
        owner.workspaceId,
        member.memberId,
        "2030-08-15",
      ),
    ).toBe(true);
    expect(
      await calendar.isHoliday(
        owner.workspaceId,
        member.memberId,
        "2030-08-13",
      ),
    ).toBe(false);
  });

  it("is on /api/docs", async () => {
    const spec = await json<{
      paths: Record<string, Record<string, unknown>>;
    }>(getOpenApi());
    for (const [path, method] of [
      ["/api/construction/hrms/holidays", "get"],
      ["/api/construction/hrms/holidays", "post"],
      ["/api/construction/hrms/holidays/{id}/update", "post"],
      ["/api/construction/hrms/holidays/{id}/delete", "post"],
      ["/api/construction/hrms/holidays/sample", "get"],
      ["/api/construction/hrms/holidays/import", "post"],
    ] as const)
      expect(spec.paths[path]?.[method]).toBeDefined();
  });
});
