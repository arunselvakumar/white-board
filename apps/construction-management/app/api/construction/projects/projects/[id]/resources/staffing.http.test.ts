import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it } from "vitest";

import { POST as createEmployee } from "@/app/api/construction/labour/employees/route";
import { GET as getOpenApi } from "@/app/api/openapi.json/route";
import { createEmployeeHandlers } from "@/src/labour/infrastructure/create-employee-handlers";
import { createTeamMemberHandlers } from "@/src/organization/infrastructure/create-team-member-handlers";
import type { Flag } from "@/src/shared-kernel/access";
import {
  addDays,
  calendarDateFromDb,
  calendarDateToDb,
} from "@/src/shared-kernel/calendar-date";
import { companyToday } from "@/src/shared-kernel/company-today";
import { newId } from "@/src/shared-kernel/ids";
import {
  addProject,
  jsonRequest,
  memberWith,
  ownerWithCompany,
} from "@/test/companies";
import { seededRoleId } from "@/test/employees";
import { newMobile, TEST_ORIGIN } from "@/test/sessions";

import { POST as removeEmployee } from "./employees/[employeeId]/remove/route";
import { GET as employeeOptions } from "./employees/options/route";
import { GET as listEmployees, POST as addEmployees } from "./employees/route";
import { GET as getResources } from "./route";
import { GET as teamMemberOptions } from "./team-members/options/route";
import { POST as setTeamMembers } from "./team-members/route";

const API = `${TEST_ORIGIN}/api/construction`;

type Company = Awaited<ReturnType<typeof ownerWithCompany>>;

type EmployeeLine = {
  id: string;
  name: string;
  employeeCode: string | null;
  role: { id: string; name: string };
  labourCategory: { id: string; name: string } | null;
  since: string;
  isActive: boolean;
};

type EmployeePage = {
  items: EmployeeLine[];
  nextCursor: string | null;
  prevCursor: string | null;
  total: number;
};

type Resources = {
  today: string;
  employees: { total: number };
  teamMembers: { id: string; isOwner: boolean }[];
};

type ErrorBody = { code: string; message: string; details?: unknown };

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

function url(projectId: string, rest = ""): string {
  return `${API}/projects/projects/${projectId}/resources${rest}`;
}

async function resources(cookie: string, projectId: string) {
  const response = await getResources(
    jsonRequest(url(projectId), cookie),
    params(projectId),
  );
  expect(response.status).toBe(StatusCodes.OK);
  return json<Resources>(response);
}

function list(cookie: string, projectId: string, query = "") {
  return listEmployees(
    jsonRequest(url(projectId, `/employees${query}`), cookie),
    params(projectId),
  );
}

function options(cookie: string, projectId: string, query = "") {
  return employeeOptions(
    jsonRequest(url(projectId, `/employees/options${query}`), cookie),
    params(projectId),
  );
}

function add(
  cookie: string,
  projectId: string,
  body: { employeeIds: string[]; from?: string | null; remark?: string | null },
) {
  return addEmployees(
    jsonRequest(url(projectId, "/employees"), cookie, body),
    params(projectId),
  );
}

function remove(
  cookie: string,
  projectId: string,
  employeeId: string,
  body: { lastDay?: string | null; remark?: string | null },
) {
  return removeEmployee(
    jsonRequest(
      url(projectId, `/employees/${employeeId}/remove`),
      cookie,
      body,
    ),
    { params: Promise.resolve({ id: projectId, employeeId }) },
  );
}

function setTeam(
  cookie: string,
  projectId: string,
  ids: string[],
  expectedIds: string[],
) {
  return setTeamMembers(
    jsonRequest(url(projectId, "/team-members"), cookie, { ids, expectedIds }),
    params(projectId),
  );
}

async function refusal(response: Response, status: StatusCodes) {
  expect(response.status).toBe(status);
  return json<ErrorBody>(response);
}

async function category(company: Company, name: string): Promise<string> {
  const id = newId();
  await prisma.constructionMastersLabourCategory.create({
    data: {
      id,
      workspaceId: company.workspaceId,
      name,
      createdBy: "test",
      updatedBy: "test",
    },
  });
  return id;
}

async function labour(
  company: Company,
  name: string,
  extra: {
    employeeCode?: string;
    mobile?: string;
    labourCategoryId?: string;
    projectIds?: string[];
    joiningDate?: string;
  } = {},
): Promise<string> {
  const created = await createEmployeeHandlers().employees.create({
    workspaceId: company.workspaceId,
    employee: {
      name,
      roleId: await seededRoleId(company.workspaceId),
      joiningDate: "2026-01-01",
      wageType: "daily",
      wagePerDay: 70_000,
      overtimeWagePerHour: 10_000,
      ...extra,
    },
    by: company.userId,
  });
  return created.id;
}

async function markAttendance(
  company: Company,
  employeeId: string,
  projectId: string,
  date: string,
) {
  await prisma.constructionLabourAttendance.create({
    data: {
      id: newId(),
      workspaceId: company.workspaceId,
      projectId,
      employeeId,
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

async function historyOf(employeeId: string) {
  const rows = await prisma.constructionLabourEmployeeTransfer.findMany({
    where: { employeeId },
    orderBy: [{ transferDate: "asc" }, { createdAt: "asc" }],
  });
  return rows.map((row) => ({
    ...row,
    transferDate: calendarDateFromDb(row.transferDate),
  }));
}

async function memberOn(
  company: Company,
  projectIds: string[],
  permissions: Record<string, Flag[]>,
) {
  const member = await memberWith(company, permissions);
  await createTeamMemberHandlers().assignProjects({
    workspaceId: company.workspaceId,
    id: member.memberId,
    by: company.userId,
    projectIds,
  });
  return member;
}

async function projectsOf(memberId: string): Promise<string[]> {
  const rows = await prisma.constructionOrganizationTeamMemberProject.findMany({
    where: { memberId },
    select: { projectId: true },
  });
  return rows.map((row) => row.projectId);
}

describe("Employees on a Project's Teams (ADR CM-0038 §2, CM-0055 §5)", () => {
  it("adds many from a date as one batch and lists them by name, searchable and paged", async () => {
    const company = await ownerWithCompany();
    const project = await addProject(company.workspaceId, company.userId);
    const other = await addProject(company.workspaceId, company.userId);
    const mason = await category(company, "Shuttering Mason");
    const [arun, bala, chitra, devi] = await Promise.all([
      labour(company, "Arun", {
        employeeCode: "L-001",
        labourCategoryId: mason,
      }),
      labour(company, "Bala", { mobile: "98400 12345" }),
      labour(company, "Chitra", { projectIds: [other] }),
      labour(company, "Devi"),
    ]);

    // Back-dated: From is well before today.
    const added = await add(company.cookie, project, {
      employeeIds: [chitra, arun, bala],
      from: "2026-03-02",
      remark: "Slab work",
    });
    expect(added.status).toBe(StatusCodes.NO_CONTENT);

    const rows = await prisma.constructionLabourEmployeeTransfer.findMany({
      where: { workspaceId: company.workspaceId, toProjectId: project },
    });
    expect(rows).toHaveLength(3);
    // One batch: same time, author, date and remark (the Project feed groups by them).
    expect(new Set(rows.map((row) => row.createdAt.getTime())).size).toBe(1);
    for (const row of rows)
      expect(row).toMatchObject({
        fromProjectId: null,
        createdBy: company.userId,
        remark: "Slab work",
        transferDate: calendarDateToDb("2026-03-02"),
      });
    // Chitra keeps her other Project.
    const chitraProjects =
      await prisma.constructionLabourEmployeeProject.findMany({
        where: { employeeId: chitra },
      });
    expect(chitraProjects.map((row) => row.projectId).sort()).toEqual(
      [project, other].sort(),
    );
    const audits = await prisma.constructionOrganizationAuditEvent.findMany({
      where: {
        workspaceId: company.workspaceId,
        action: "employee.projects_changed",
      },
    });
    expect(audits.map((audit) => audit.entityId).sort()).toEqual(
      [arun, bala, chitra].sort(),
    );
    expect(audits.find((audit) => audit.entityId === chitra)).toMatchObject({
      before: { projectIds: [other] },
      after: {
        projectIds: [other, project],
        projectId: project,
        from: "2026-03-02",
        remark: "Slab work",
      },
    });

    expect((await resources(company.cookie, project)).employees).toEqual({
      total: 3,
    });
    const first = await json<EmployeePage>(
      await list(company.cookie, project, "?limit=2"),
    );
    expect(first.total).toBe(3);
    expect(first.items.map((item) => item.name)).toEqual(["Arun", "Bala"]);
    expect(first.items[0]).toEqual({
      id: arun,
      name: "Arun",
      employeeCode: "L-001",
      role: { id: await seededRoleId(company.workspaceId), name: "Labour" },
      labourCategory: { id: mason, name: "Shuttering Mason" },
      since: "2026-03-02",
      isActive: true,
    });
    expect(first.prevCursor).toBeNull();
    const second = await json<EmployeePage>(
      await list(
        company.cookie,
        project,
        `?limit=2&after=${first.nextCursor ?? ""}`,
      ),
    );
    expect(second.items.map((item) => item.name)).toEqual(["Chitra"]);
    expect(second.nextCursor).toBeNull();
    const back = await json<EmployeePage>(
      await list(
        company.cookie,
        project,
        `?limit=2&before=${second.prevCursor ?? ""}`,
      ),
    );
    expect(back.items.map((item) => item.name)).toEqual(["Arun", "Bala"]);

    for (const [search, expected] of [
      ["chit", ["Chitra"]],
      ["L-001", ["Arun"]],
      ["98400", ["Bala"]],
      ["Devi", []],
    ] as const) {
      const found = await json<EmployeePage>(
        await list(
          company.cookie,
          project,
          `?search=${encodeURIComponent(search)}`,
        ),
      );
      expect(
        found.items.map((item) => item.name),
        search,
      ).toEqual(expected);
    }

    // Options: active Labours not on the Project.
    await createEmployeeHandlers().employees.setActive({
      workspaceId: company.workspaceId,
      id: await labour(company, "Ezhil"),
      active: false,
      by: company.userId,
    });
    const choices = await json<{
      items: { id: string; name: string; joiningDate: string }[];
      hasMore: boolean;
    }>(await options(company.cookie, project));
    expect(choices.items.map((item) => item.name)).toEqual(["Devi"]);
    expect(choices.items[0]).toMatchObject({
      id: devi,
      joiningDate: "2026-01-01",
    });
    expect(choices.hasMore).toBe(false);
    const limited = await json<{ items: unknown[]; hasMore: boolean }>(
      await options(company.cookie, other, "?limit=1"),
    );
    expect(limited).toMatchObject({ hasMore: true });
    expect(limited.items).toHaveLength(1);
  });

  it("refuses a batch as a whole, naming the Employee, and writes nothing", async () => {
    const company = await ownerWithCompany();
    const project = await addProject(company.workspaceId, company.userId);
    const [arun, bala, chitra] = await Promise.all([
      labour(company, "Arun"),
      labour(company, "Bala", { projectIds: [project] }),
      labour(company, "Chitra", { joiningDate: "2026-05-01" }),
    ]);
    const before = await prisma.constructionLabourEmployeeTransfer.count({
      where: { workspaceId: company.workspaceId },
    });

    const already = await refusal(
      await add(company.cookie, project, {
        employeeIds: [arun, bala],
        from: "2026-06-01",
      }),
      StatusCodes.CONFLICT,
    );
    expect(already).toMatchObject({
      code: "EMPLOYEE_ALREADY_ON_PROJECT",
      details: { employeeId: bala },
    });
    expect(already.message).toContain("Bala");

    const early = await refusal(
      await add(company.cookie, project, {
        employeeIds: [arun, chitra],
        from: "2026-04-01",
      }),
      StatusCodes.BAD_REQUEST,
    );
    expect(early).toMatchObject({
      code: "FROM_BEFORE_JOINING_DATE",
      details: { field: "from", employeeId: chitra },
    });

    const unknown = await refusal(
      await add(company.cookie, project, {
        employeeIds: [arun, crypto.randomUUID()],
        from: "2026-06-01",
      }),
      StatusCodes.NOT_FOUND,
    );
    expect(unknown.code).toBe("EMPLOYEE_NOT_FOUND");

    await createEmployeeHandlers().employees.setActive({
      workspaceId: company.workspaceId,
      id: chitra,
      active: false,
      by: company.userId,
    });
    const inactive = await refusal(
      await add(company.cookie, project, {
        employeeIds: [arun, chitra],
        from: "2026-06-01",
      }),
      StatusCodes.BAD_REQUEST,
    );
    expect(inactive).toMatchObject({
      code: "EMPLOYEE_INACTIVE",
      details: { employeeId: chitra },
    });

    const badDate = await refusal(
      await add(company.cookie, project, {
        employeeIds: [arun],
        from: "2026-02-30",
      }),
      StatusCodes.BAD_REQUEST,
    );
    expect(badDate).toMatchObject({
      code: "FROM_DATE_INVALID",
      details: { field: "from" },
    });
    expect(
      (
        await refusal(
          await add(company.cookie, project, {
            employeeIds: [arun],
            remark: "x".repeat(501),
          }),
          StatusCodes.BAD_REQUEST,
        )
      ).code,
    ).toBe("REMARK_TOO_LONG");
    expect(
      (
        await refusal(
          await add(company.cookie, project, { employeeIds: [] }),
          StatusCodes.BAD_REQUEST,
        )
      ).code,
    ).toBe("VALIDATION_ERROR");

    // Their last move was on 2026-06-10: a From before it is refused.
    await remove(company.cookie, project, bala, { lastDay: "2026-06-09" });
    const beforeMove = await refusal(
      await add(company.cookie, project, {
        employeeIds: [arun, bala],
        from: "2026-06-05",
      }),
      StatusCodes.CONFLICT,
    );
    expect(beforeMove).toMatchObject({
      code: "TRANSFER_BEFORE_LAST_TRANSFER",
      details: { field: "from", employeeId: bala },
    });

    expect(
      await prisma.constructionLabourEmployeeTransfer.count({
        where: { workspaceId: company.workspaceId },
      }),
    ).toBe(before + 1);
    expect(
      await prisma.constructionLabourEmployeeProject.count({
        where: { employeeId: arun },
      }),
    ).toBe(0);
  });

  it("removes after the Last day, which may be the last attendance day but not before it", async () => {
    const company = await ownerWithCompany();
    const project = await addProject(company.workspaceId, company.userId);
    const other = await addProject(company.workspaceId, company.userId);
    const [arun, bala] = await Promise.all([
      labour(company, "Arun", { projectIds: [project, other] }),
      labour(company, "Bala", { projectIds: [project] }),
    ]);
    await markAttendance(company, arun, project, "2026-06-10");
    // Attendance on another Project does not hold them here.
    await markAttendance(company, arun, other, "2026-07-01");

    const afterLastDay = await refusal(
      await remove(company.cookie, project, arun, { lastDay: "2026-06-09" }),
      StatusCodes.CONFLICT,
    );
    expect(afterLastDay).toMatchObject({
      code: "TRANSFER_BEFORE_ATTENDANCE",
      details: {
        field: "lastDay",
        employeeId: arun,
        latestAttendanceDate: "2026-06-10",
      },
    });
    expect(afterLastDay.message).toContain("Last day");

    const onLastDay = await remove(company.cookie, project, arun, {
      lastDay: "2026-06-10",
      remark: "Slab done",
    });
    expect(onLastDay.status).toBe(StatusCodes.NO_CONTENT);
    expect((await historyOf(arun)).at(-1)).toMatchObject({
      fromProjectId: project,
      toProjectId: null,
      transferDate: "2026-06-11",
      remark: "Slab done",
      createdBy: company.userId,
    });
    const left = await prisma.constructionLabourEmployeeProject.findMany({
      where: { employeeId: arun },
    });
    expect(left.map((row) => row.projectId)).toEqual([other]);
    // Attendance already recorded stays.
    expect(
      await prisma.constructionLabourAttendance.count({
        where: { employeeId: arun, deletedAt: null },
      }),
    ).toBe(2);

    const again = await refusal(
      await remove(company.cookie, project, arun, {}),
      StatusCodes.CONFLICT,
    );
    expect(again).toMatchObject({
      code: "EMPLOYEE_NOT_ON_PROJECT",
      details: { employeeId: arun },
    });
    expect(
      (
        await refusal(
          await remove(company.cookie, project, crypto.randomUUID(), {}),
          StatusCodes.NOT_FOUND,
        )
      ).code,
    ).toBe("EMPLOYEE_NOT_FOUND");
    const bad = await refusal(
      await remove(company.cookie, project, bala, { lastDay: "June 1" }),
      StatusCodes.BAD_REQUEST,
    );
    expect(bad).toMatchObject({
      code: "LAST_DAY_INVALID",
      details: { field: "lastDay" },
    });
    // Joined on 2026-01-01: the earliest Last day is 2025-12-31.
    const beforeJoining = await refusal(
      await remove(company.cookie, project, bala, { lastDay: "2025-12-30" }),
      StatusCodes.CONFLICT,
    );
    expect(beforeJoining).toMatchObject({
      code: "TRANSFER_BEFORE_LAST_TRANSFER",
      details: { field: "lastDay", employeeId: bala },
    });
  });

  it("dates an add and a remove today in the Company's time zone when none is given", async () => {
    const company = await ownerWithCompany();
    const project = await addProject(company.workspaceId, company.userId);
    const arun = await labour(company, "Arun");
    const today = await companyToday(prisma, company.workspaceId);
    expect((await resources(company.cookie, project)).today).toBe(today);

    expect(
      (await add(company.cookie, project, { employeeIds: [arun] })).status,
    ).toBe(StatusCodes.NO_CONTENT);
    expect((await historyOf(arun)).at(-1)?.transferDate).toBe(today);
    expect(
      (await remove(company.cookie, project, arun, { lastDay: null })).status,
    ).toBe(StatusCodes.NO_CONTENT);
    expect((await historyOf(arun)).at(-1)).toMatchObject({
      fromProjectId: project,
      transferDate: addDays(today, 1),
    });
  });

  it("needs the Project menu, the Project, and Labours Read for the picker", async () => {
    const company = await ownerWithCompany();
    const project = await addProject(company.workspaceId, company.userId);
    const elsewhere = await addProject(company.workspaceId, company.userId);
    const arun = await labour(company, "Arun", { projectIds: [project] });
    const bala = await labour(company, "Bala");

    const viewer = await memberOn(company, [project], {
      "projects.project": ["read"],
      "masters.labours": ["read"],
    });
    expect((await list(viewer.cookie, project)).status).toBe(StatusCodes.OK);
    for (const response of [
      await add(viewer.cookie, project, { employeeIds: [bala] }),
      await remove(viewer.cookie, project, arun, {}),
      await options(viewer.cookie, project),
    ])
      expect(response.status).toBe(StatusCodes.FORBIDDEN);

    const editor = await memberOn(company, [project], {
      "projects.project": ["read", "update"],
    });
    // Without Labours Read the picker is closed; the commands are not.
    expect((await options(editor.cookie, project)).status).toBe(
      StatusCodes.FORBIDDEN,
    );
    const picker = await memberOn(company, [project], {
      "projects.project": ["read", "update"],
      "masters.labours": ["read"],
    });
    expect((await options(picker.cookie, project)).status).toBe(StatusCodes.OK);

    // Not on the other Project: it does not exist for them.
    for (const response of [
      await list(picker.cookie, elsewhere),
      await options(picker.cookie, elsewhere),
      await add(picker.cookie, elsewhere, { employeeIds: [bala] }),
      await remove(picker.cookie, elsewhere, arun, {}),
    ]) {
      expect(response.status).toBe(StatusCodes.NOT_FOUND);
      expect((await json<ErrorBody>(response)).code).toBe("PROJECT_NOT_FOUND");
    }

    const outsider = await ownerWithCompany("Other Builders");
    expect((await list(outsider.cookie, project)).status).toBe(
      StatusCodes.NOT_FOUND,
    );
    expect(
      (await add(outsider.cookie, project, { employeeIds: [bala] })).status,
    ).toBe(StatusCodes.NOT_FOUND);

    expect(
      (await add(editor.cookie, project, { employeeIds: [bala] })).status,
    ).toBe(StatusCodes.NO_CONTENT);
    expect(
      (await remove(editor.cookie, project, bala, { lastDay: null })).status,
    ).toBe(StatusCodes.NO_CONTENT);
  });
});

describe("Employees who sign in, on a Project's Teams (ADR CM-0055 §4, §5)", () => {
  it("moves their sign-in with them and keeps it out of Team Members", async () => {
    const company = await ownerWithCompany();
    const project = await addProject(company.workspaceId, company.userId);
    const engineerRole = await seededRoleId(
      company.workspaceId,
      "Site Engineer",
    );
    const response = await createEmployee(
      jsonRequest(`${API}/labour/employees`, company.cookie, {
        name: "Anand",
        roleId: engineerRole,
        mobile: newMobile(),
        joiningDate: "2026-01-01",
        wageType: "monthly",
        wagePerMonth: 30_00_000,
        overtimeWagePerHour: 0,
        signIn: { canSignIn: true, password: "first-pass-1234" },
      }),
    );
    expect(response.status).toBe(StatusCodes.CREATED);
    const anand = await json<{ id: string; signIn: { memberId: string } }>(
      response,
    );
    const memberId = anand.signIn.memberId;
    const staff = await memberWith(company, {});
    await createTeamMemberHandlers().assignProjects({
      workspaceId: company.workspaceId,
      id: staff.memberId,
      by: company.userId,
      projectIds: [project],
    });

    // Added from the Teams: on the Project as an Employee, with their Role.
    expect(
      (await add(company.cookie, project, { employeeIds: [anand.id] })).status,
    ).toBe(StatusCodes.NO_CONTENT);
    expect(await projectsOf(memberId)).toEqual([project]);
    const page = await json<EmployeePage>(await list(company.cookie, project));
    expect(page.items).toEqual([
      expect.objectContaining({
        id: anand.id,
        role: { id: engineerRole, name: "Site Engineer" },
      }),
    ]);
    const summary = await resources(company.cookie, project);
    expect(summary.employees).toEqual({ total: 1 });
    const teamIds = summary.teamMembers.map((line) => line.id);
    expect(teamIds).toContain(staff.memberId);
    expect(teamIds).not.toContain(memberId);

    // Team Members neither offer nor take nor drop an Employee's sign-in.
    const teamChoices = await json<{ items: { id: string }[] }>(
      await teamMemberOptions(
        jsonRequest(url(project, "/team-members/options"), company.cookie),
        params(project),
      ),
    );
    expect(teamChoices.items.map((item) => item.id)).not.toContain(memberId);
    const teamSaved = await setTeam(
      company.cookie,
      project,
      [],
      [staff.memberId, memberId],
    );
    expect(teamSaved.status).toBe(StatusCodes.OK);
    expect(await projectsOf(staff.memberId)).toEqual([]);
    expect(await projectsOf(memberId)).toEqual([project]);
    const other = await addProject(company.workspaceId, company.userId);
    const refused = await refusal(
      await setTeam(company.cookie, other, [memberId], []),
      StatusCodes.BAD_REQUEST,
    );
    expect(refused.code).toBe("TEAM_MEMBER_NOT_FOUND");
    expect(await projectsOf(memberId)).toEqual([project]);

    // Removed from the Teams: off the sign-in's Projects too.
    expect(
      (await remove(company.cookie, project, anand.id, { lastDay: null }))
        .status,
    ).toBe(StatusCodes.NO_CONTENT);
    expect(await projectsOf(memberId)).toEqual([]);
  });

  it("is listed in the OpenAPI document, without the Site Engineers routes", async () => {
    const document = await json<{
      paths: Record<string, Record<string, unknown>>;
    }>(getOpenApi());
    const base = "/api/construction/projects/projects/{id}/resources";
    for (const [path, method] of [
      [`${base}/employees`, "get"],
      [`${base}/employees`, "post"],
      [`${base}/employees/options`, "get"],
      [`${base}/employees/{employeeId}/remove`, "post"],
    ] as const)
      expect(document.paths[path]?.[method], path).toBeDefined();
    for (const gone of ["site-engineers", "labours"])
      expect(document.paths[`${base}/${gone}`]).toBeUndefined();
  });
});
