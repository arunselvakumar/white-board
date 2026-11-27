import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it } from "vitest";

import { GET as getOpenApi } from "@/app/api/openapi.json/route";
import type { Flag } from "@/src/shared-kernel/access";
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
import { seedEmployee, seededRoleId } from "@/test/employees";
import { TEST_ORIGIN } from "@/test/sessions";

import { GET as getActivity } from "./route";

const API = `${TEST_ORIGIN}/api/construction`;
const TODAY = todayIn("Asia/Kolkata");
const day = (offset: number) => addDays(TODAY, offset);

type Company = Awaited<ReturnType<typeof ownerWithCompany>>;

type Person = {
  id: string | null;
  name: string;
  employeeCode?: string | null;
  role?: string | null;
  canOpen: boolean;
};

type Entry = {
  id: string;
  kind: string;
  date: string;
  recordedAt: string;
  by: string | null;
  employees?: Person[];
  fromProject?: { id: string; name: string; canOpen: boolean } | null;
  toProject?: { id: string; name: string; canOpen: boolean } | null;
  remark?: string | null;
};

type Page = { items: Entry[]; nextCursor: string | null; timeZone: string };

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

function read(cookie: string, projectId: string, query = "") {
  return getActivity(
    jsonRequest(
      `${API}/projects/projects/${projectId}/activity${query}`,
      cookie,
    ),
    params(projectId),
  );
}

async function everything(
  cookie: string,
  projectId: string,
  query = "",
): Promise<Entry[]> {
  const entries: Entry[] = [];
  let cursor: string | null = null;
  do {
    const separator = query === "" ? "?" : "&";
    const response = await read(
      cookie,
      projectId,
      cursor == null
        ? query
        : `${query}${separator}cursor=${encodeURIComponent(cursor)}`,
    );
    if (response.status !== 200)
      throw new Error(`activity: ${await response.text()}`);
    const page = await json<Page>(response);
    entries.push(...page.items);
    cursor = page.nextCursor;
  } while (cursor != null);
  return entries;
}

function summary(entries: readonly Entry[]) {
  return entries.map((entry) => [
    entry.kind,
    entry.date,
    ...(entry.employees?.map((employee) => employee.name) ?? []),
  ]);
}

/**
 * History rows written by one command (CM-206): one recorded time and
 * actor, so the Project feed shows them as one entry. Joining rows also put
 * the Employee on the Project; leaving rows take them off.
 */
async function moves(
  company: Company,
  at: Date,
  rows: readonly {
    employeeId: string;
    from: string | null;
    to: string | null;
    date: string;
    remark?: string;
  }[],
) {
  for (const row of rows) {
    const transferDate = calendarDateToDb(row.date);
    if (row.from != null)
      await prisma.constructionLabourEmployeeProject.deleteMany({
        where: { employeeId: row.employeeId, projectId: row.from },
      });
    if (row.to != null)
      await prisma.constructionLabourEmployeeProject.create({
        data: {
          workspaceId: company.workspaceId,
          employeeId: row.employeeId,
          projectId: row.to,
          since: transferDate,
        },
      });
    await prisma.constructionLabourEmployeeTransfer.create({
      data: {
        id: newId(at.getTime()),
        workspaceId: company.workspaceId,
        employeeId: row.employeeId,
        fromProjectId: row.from,
        toProjectId: row.to,
        transferDate,
        remark: row.remark ?? null,
        createdAt: at,
        createdBy: company.userId,
      },
    });
  }
}

function employee(company: Company, name: string, roleId?: string) {
  return seedEmployee({
    workspaceId: company.workspaceId,
    name,
    roleId,
    joiningDate: day(-40),
    by: company.userId,
  });
}

async function memberOn(
  company: Company,
  permissions: Record<string, Flag[]>,
  projectIds: string[],
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

/**
 * Sky Towers and Green Park. Three Employees put on Sky Towers in one
 * command 30 days ago; Ravi and Selvi moved from Green Park to Sky Towers
 * in one transfer 5 days ago; Ganesh moved from Sky Towers to Green Park 3
 * days ago; Karthik, a Site Engineer, put on Sky Towers 2 days ago; Kumar
 * taken off Sky Towers today (last day yesterday) and then deleted.
 */
async function history(company: Company) {
  const [sky, green] = await Promise.all([
    addProject(company.workspaceId, company.userId, "Sky Towers"),
    addProject(company.workspaceId, company.userId, "Green Park"),
  ]);
  const [kumar, ganesh, arul, ravi, selvi] = [
    await employee(company, "Kumar"),
    await employee(company, "Ganesh"),
    await employee(company, "Arul"),
    await employee(company, "Ravi"),
    await employee(company, "Selvi"),
  ];
  const karthik = await employee(
    company,
    "Karthik Raja",
    await seededRoleId(company.workspaceId, "Site Engineer"),
  );
  const minutesAgo = (minutes: number) =>
    new Date(Date.now() - minutes * 60_000);
  await moves(company, minutesAgo(60), [
    { employeeId: ravi, from: null, to: green, date: day(-40) },
  ]);
  await moves(company, minutesAgo(59), [
    { employeeId: selvi, from: null, to: green, date: day(-40) },
  ]);
  await moves(
    company,
    minutesAgo(50),
    [kumar, ganesh, arul].map((employeeId) => ({
      employeeId,
      from: null,
      to: sky,
      date: day(-30),
    })),
  );
  await moves(
    company,
    minutesAgo(40),
    [selvi, ravi].map((employeeId) => ({
      employeeId,
      from: green,
      to: sky,
      date: day(-5),
      remark: "Slab casting",
    })),
  );
  await moves(company, minutesAgo(30), [
    { employeeId: ganesh, from: sky, to: green, date: day(-3) },
  ]);
  await moves(company, minutesAgo(20), [
    { employeeId: karthik, from: null, to: sky, date: day(-2) },
  ]);
  await moves(company, minutesAgo(10), [
    { employeeId: kumar, from: sky, to: null, date: TODAY },
  ]);
  await prisma.constructionLabourEmployee.update({
    where: { id: kumar },
    data: { deletedAt: new Date(), deletedBy: company.userId },
  });
  return { sky, green, karthik, kumar };
}

const SKY = [
  ["employee_removed", day(-1), "Kumar"],
  ["employee_added", day(-2), "Karthik Raja"],
  ["transferred_out", day(-3), "Ganesh"],
  ["transferred_in", day(-5), "Ravi", "Selvi"],
  ["employee_added", day(-30), "Arul", "Ganesh", "Kumar"],
];

describe("Project Activity (ADR CM-0038)", () => {
  it("shows Employees added and removed with their Role, transfers, and a batch as one entry", async () => {
    const company = await ownerWithCompany();
    const { sky, green, karthik, kumar } = await history(company);
    const owner = await prisma.constructionOrganizationTeamMember.findFirst({
      where: { workspaceId: company.workspaceId, userId: company.userId },
      select: { name: true },
    });

    const entries = await everything(company.cookie, sky);
    expect(summary(entries)).toEqual(SKY);
    for (const entry of entries) expect(entry.by).toBe(owner?.name);
    const [removed, karthikOn, out, transferIn, batch] = entries;
    expect(karthikOn?.employees).toEqual([
      {
        id: karthik,
        name: "Karthik Raja",
        employeeCode: null,
        role: "Site Engineer",
        canOpen: true,
      },
    ]);
    expect(removed?.employees).toEqual([
      expect.objectContaining({ id: kumar, name: "Kumar", canOpen: false }),
    ]);
    expect(out).toMatchObject({
      toProject: { id: green, name: "Green Park", canOpen: true },
      remark: null,
    });
    expect(transferIn).toMatchObject({
      fromProject: { id: green, name: "Green Park", canOpen: true },
      remark: "Slab casting",
    });
    expect(batch?.employees).toHaveLength(3);
    expect(batch?.employees?.[0]).toEqual({
      id: expect.any(String) as string,
      name: "Arul",
      employeeCode: null,
      role: "Labour",
      canOpen: true,
    });
    // No Site Engineer entries of their own any more (ADR CM-0055 §1).
    expect(entries.map((entry) => entry.kind)).not.toContain(
      "site_engineer_added",
    );

    // Transfers seen from the other side.
    expect(summary(await everything(company.cookie, green))).toEqual([
      ["transferred_in", day(-3), "Ganesh"],
      ["transferred_out", day(-5), "Ravi", "Selvi"],
      ["employee_added", day(-40), "Selvi"],
      ["employee_added", day(-40), "Ravi"],
    ]);
    const greenEntries = await everything(company.cookie, green);
    expect(greenEntries[0]?.fromProject).toMatchObject({ id: sky });
    expect(JSON.stringify(entries).toLowerCase()).not.toMatch(
      /wage|amount|attendance/,
    );
  });

  it("filters by who and by date range", async () => {
    const company = await ownerWithCompany();
    const { sky } = await history(company);
    expect(
      summary(await everything(company.cookie, sky, "?who=employees")),
    ).toEqual(SKY);
    expect(
      summary(await everything(company.cookie, sky, "?who=vendors")),
    ).toEqual([]);
    expect(
      summary(
        await everything(company.cookie, sky, `?from=${day(-5)}&to=${day(-1)}`),
      ),
    ).toEqual(SKY.slice(0, 4));
    for (const who of ["everyone", "labours", "site_engineers"])
      expect((await read(company.cookie, sky, `?who=${who}`)).status).toBe(
        StatusCodes.BAD_REQUEST,
      );
    expect(
      (await read(company.cookie, sky, `?from=${day(-1)}&to=${day(-5)}`))
        .status,
    ).toBe(StatusCodes.BAD_REQUEST);
  });

  it("needs Project Read and the viewer on the Project; links people only with Employees Read", async () => {
    const company = await ownerWithCompany();
    const { sky, green } = await history(company);

    const onSky = await memberOn(company, { "projects.project": ["read"] }, [
      sky,
    ]);
    const seen = await everything(onSky.cookie, sky);
    expect(summary(seen)).toEqual(SKY);
    for (const entry of seen)
      for (const employee of entry.employees ?? [])
        expect(employee.canOpen).toBe(false);
    // Green Park is not theirs: named, not linked.
    expect(seen[2]?.toProject).toMatchObject({
      id: green,
      name: "Green Park",
      canOpen: false,
    });

    const notOnIt = await read(onSky.cookie, green);
    expect(notOnIt.status).toBe(StatusCodes.NOT_FOUND);
    expect((await json<{ code: string }>(notOnIt)).code).toBe(
      "PROJECT_NOT_FOUND",
    );
    const noRead = await memberOn(company, { "masters.labours": ["read"] }, [
      sky,
    ]);
    expect((await read(noRead.cookie, sky)).status).toBe(StatusCodes.FORBIDDEN);
    const other = await ownerWithCompany("Kaveri Builders");
    expect((await read(other.cookie, sky)).status).toBe(StatusCodes.NOT_FOUND);
  });

  it("is on /api/docs", async () => {
    const doc = await json<{
      paths: Record<string, Record<string, unknown>>;
      components: { schemas: Record<string, unknown> };
    }>(getOpenApi());
    expect(
      doc.paths["/api/construction/projects/projects/{id}/activity"]?.["get"],
    ).toBeDefined();
    expect(
      doc.components.schemas["ListConstructionProjectsProjectActivityResponse"],
    ).toBeDefined();
  });
});
