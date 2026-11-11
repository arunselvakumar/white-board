import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it } from "vitest";

import { POST as createSiteEngineer } from "@/app/api/construction/masters/site-engineers/route";
import { GET as getOpenApi } from "@/app/api/openapi.json/route";
import { createLabourHandlers } from "@/src/labour/infrastructure/create-labour-handlers";
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
import { newEmail, newMobile, TEST_ORIGIN } from "@/test/sessions";

import { POST as removeLabour } from "./labours/[labourId]/remove/route";
import { GET as labourOptions } from "./labours/options/route";
import { GET as listLabours, POST as addLabours } from "./labours/route";
import { GET as getResources } from "./route";
import { GET as siteEngineerOptions } from "./site-engineers/options/route";
import { POST as setSiteEngineers } from "./site-engineers/route";
import { GET as teamMemberOptions } from "./team-members/options/route";
import { POST as setTeamMembers } from "./team-members/route";

const API = `${TEST_ORIGIN}/api/construction`;

type Company = Awaited<ReturnType<typeof ownerWithCompany>>;

type LabourLine = {
  id: string;
  name: string;
  labourCode: string | null;
  labourCategory: { id: string; name: string } | null;
  since: string;
  isActive: boolean;
};

type LabourPage = {
  items: LabourLine[];
  nextCursor: string | null;
  prevCursor: string | null;
  total: number;
};

type SiteEngineerLine = {
  id: string;
  name: string;
  mobile: string | null;
  employeeCode: string | null;
  disabled: boolean;
};

type Resources = {
  siteEngineers: SiteEngineerLine[];
  labours: { total: number };
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
  return listLabours(
    jsonRequest(url(projectId, `/labours${query}`), cookie),
    params(projectId),
  );
}

function options(cookie: string, projectId: string, query = "") {
  return labourOptions(
    jsonRequest(url(projectId, `/labours/options${query}`), cookie),
    params(projectId),
  );
}

function add(
  cookie: string,
  projectId: string,
  body: { labourIds: string[]; from?: string | null; remark?: string | null },
) {
  return addLabours(
    jsonRequest(url(projectId, "/labours"), cookie, body),
    params(projectId),
  );
}

function remove(
  cookie: string,
  projectId: string,
  labourId: string,
  body: { lastDay?: string | null; remark?: string | null },
) {
  return removeLabour(
    jsonRequest(url(projectId, `/labours/${labourId}/remove`), cookie, body),
    { params: Promise.resolve({ id: projectId, labourId }) },
  );
}

function setEngineers(
  cookie: string,
  projectId: string,
  ids: string[],
  expectedIds: string[],
) {
  return setSiteEngineers(
    jsonRequest(url(projectId, "/site-engineers"), cookie, {
      ids,
      expectedIds,
    }),
    params(projectId),
  );
}

function engineerOptions(cookie: string, projectId: string) {
  return siteEngineerOptions(
    jsonRequest(url(projectId, "/site-engineers/options"), cookie),
    params(projectId),
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
    labourCode?: string;
    contactNumber?: string;
    labourCategoryId?: string;
    projectIds?: string[];
    joiningDate?: string;
  } = {},
): Promise<string> {
  const created = await createLabourHandlers().labours.create({
    workspaceId: company.workspaceId,
    labour: {
      name,
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
  labourId: string,
  projectId: string,
  date: string,
) {
  await prisma.constructionLabourAttendance.create({
    data: {
      id: newId(),
      workspaceId: company.workspaceId,
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

async function historyOf(labourId: string) {
  const rows = await prisma.constructionLabourTransfer.findMany({
    where: { labourId },
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

/** A Site Engineer with a sign-in of their own (ADR CM-0037). */
async function engineerWithSignIn(
  company: Company,
  name: string,
  projectIds: string[] = [],
): Promise<{ id: string; memberId: string }> {
  const response = await createSiteEngineer(
    jsonRequest(`${API}/masters/site-engineers`, company.cookie, {
      name,
      mobile: newMobile(),
      email: newEmail(),
      projectIds,
      profile: { employeeCode: `SE-${name.slice(0, 3)}` },
      signIn: { invite: false, password: "first-pass-1234" },
    }),
  );
  expect(response.status).toBe(StatusCodes.CREATED);
  const created = await json<{ id: string; signIn: { memberId: string } }>(
    response,
  );
  return { id: created.id, memberId: created.signIn.memberId };
}

/** A Site Engineer row as older ones are: none, or another sign-in linked. */
async function engineerRow(
  company: Company,
  name: string,
  extra: { teamMemberId?: string; disabled?: boolean } = {},
): Promise<string> {
  const id = newId();
  await prisma.constructionMastersSupervisor.create({
    data: {
      id,
      workspaceId: company.workspaceId,
      name,
      teamMemberId: extra.teamMemberId ?? null,
      disabledAt: extra.disabled === true ? new Date() : null,
      createdBy: "test",
      updatedBy: "test",
    },
  });
  return id;
}

async function projectsOf(memberId: string): Promise<string[]> {
  const rows = await prisma.constructionOrganizationTeamMemberProject.findMany({
    where: { memberId },
    select: { projectId: true },
  });
  return rows.map((row) => row.projectId);
}

describe("Labours on a Project's Resources (ADR CM-0038 §2)", () => {
  it("adds many from a date as one batch and lists them by name, searchable and paged", async () => {
    const company = await ownerWithCompany();
    const project = await addProject(company.workspaceId, company.userId);
    const other = await addProject(company.workspaceId, company.userId);
    const mason = await category(company, "Shuttering Mason");
    const [arun, bala, chitra, devi] = await Promise.all([
      labour(company, "Arun", { labourCode: "L-001", labourCategoryId: mason }),
      labour(company, "Bala", { contactNumber: "98400 12345" }),
      labour(company, "Chitra", { projectIds: [other] }),
      labour(company, "Devi"),
    ]);

    // Back-dated: From is well before today.
    const added = await add(company.cookie, project, {
      labourIds: [chitra, arun, bala],
      from: "2026-03-02",
      remark: "Slab work",
    });
    expect(added.status).toBe(StatusCodes.NO_CONTENT);

    const rows = await prisma.constructionLabourTransfer.findMany({
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
      await prisma.constructionLabourLabourProject.findMany({
        where: { labourId: chitra },
      });
    expect(chitraProjects.map((row) => row.projectId).sort()).toEqual(
      [project, other].sort(),
    );
    const audits = await prisma.constructionOrganizationAuditEvent.findMany({
      where: {
        workspaceId: company.workspaceId,
        action: "labour.projects_changed",
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

    expect((await resources(company.cookie, project)).labours).toEqual({
      total: 3,
    });
    const first = await json<LabourPage>(
      await list(company.cookie, project, "?limit=2"),
    );
    expect(first.total).toBe(3);
    expect(first.items.map((item) => item.name)).toEqual(["Arun", "Bala"]);
    expect(first.items[0]).toEqual({
      id: arun,
      name: "Arun",
      labourCode: "L-001",
      labourCategory: { id: mason, name: "Shuttering Mason" },
      since: "2026-03-02",
      isActive: true,
    });
    expect(first.prevCursor).toBeNull();
    const second = await json<LabourPage>(
      await list(
        company.cookie,
        project,
        `?limit=2&after=${first.nextCursor ?? ""}`,
      ),
    );
    expect(second.items.map((item) => item.name)).toEqual(["Chitra"]);
    expect(second.nextCursor).toBeNull();
    const back = await json<LabourPage>(
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
      const found = await json<LabourPage>(
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
    await createLabourHandlers().labours.setActive({
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

  it("refuses a batch as a whole, naming the Labour, and writes nothing", async () => {
    const company = await ownerWithCompany();
    const project = await addProject(company.workspaceId, company.userId);
    const [arun, bala, chitra] = await Promise.all([
      labour(company, "Arun"),
      labour(company, "Bala", { projectIds: [project] }),
      labour(company, "Chitra", { joiningDate: "2026-05-01" }),
    ]);
    const before = await prisma.constructionLabourTransfer.count({
      where: { workspaceId: company.workspaceId },
    });

    const already = await refusal(
      await add(company.cookie, project, {
        labourIds: [arun, bala],
        from: "2026-06-01",
      }),
      StatusCodes.CONFLICT,
    );
    expect(already).toMatchObject({
      code: "LABOUR_ALREADY_ON_PROJECT",
      details: { labourId: bala },
    });
    expect(already.message).toContain("Bala");

    const early = await refusal(
      await add(company.cookie, project, {
        labourIds: [arun, chitra],
        from: "2026-04-01",
      }),
      StatusCodes.BAD_REQUEST,
    );
    expect(early).toMatchObject({
      code: "FROM_BEFORE_JOINING_DATE",
      details: { field: "from", labourId: chitra },
    });

    const unknown = await refusal(
      await add(company.cookie, project, {
        labourIds: [arun, crypto.randomUUID()],
        from: "2026-06-01",
      }),
      StatusCodes.NOT_FOUND,
    );
    expect(unknown.code).toBe("LABOUR_NOT_FOUND");

    await createLabourHandlers().labours.setActive({
      workspaceId: company.workspaceId,
      id: chitra,
      active: false,
      by: company.userId,
    });
    const inactive = await refusal(
      await add(company.cookie, project, {
        labourIds: [arun, chitra],
        from: "2026-06-01",
      }),
      StatusCodes.BAD_REQUEST,
    );
    expect(inactive).toMatchObject({
      code: "LABOUR_INACTIVE",
      details: { labourId: chitra },
    });

    const badDate = await refusal(
      await add(company.cookie, project, {
        labourIds: [arun],
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
            labourIds: [arun],
            remark: "x".repeat(501),
          }),
          StatusCodes.BAD_REQUEST,
        )
      ).code,
    ).toBe("REMARK_TOO_LONG");
    expect(
      (
        await refusal(
          await add(company.cookie, project, { labourIds: [] }),
          StatusCodes.BAD_REQUEST,
        )
      ).code,
    ).toBe("VALIDATION_ERROR");

    // Their last move was on 2026-06-10: a From before it is refused.
    await remove(company.cookie, project, bala, { lastDay: "2026-06-09" });
    const beforeMove = await refusal(
      await add(company.cookie, project, {
        labourIds: [arun, bala],
        from: "2026-06-05",
      }),
      StatusCodes.CONFLICT,
    );
    expect(beforeMove).toMatchObject({
      code: "TRANSFER_BEFORE_LAST_TRANSFER",
      details: { field: "from", labourId: bala },
    });

    expect(
      await prisma.constructionLabourTransfer.count({
        where: { workspaceId: company.workspaceId },
      }),
    ).toBe(before + 1);
    expect(
      await prisma.constructionLabourLabourProject.count({
        where: { labourId: arun },
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
        labourId: arun,
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
    const left = await prisma.constructionLabourLabourProject.findMany({
      where: { labourId: arun },
    });
    expect(left.map((row) => row.projectId)).toEqual([other]);
    // Attendance already recorded stays.
    expect(
      await prisma.constructionLabourAttendance.count({
        where: { labourId: arun, deletedAt: null },
      }),
    ).toBe(2);

    const again = await refusal(
      await remove(company.cookie, project, arun, {}),
      StatusCodes.CONFLICT,
    );
    expect(again).toMatchObject({
      code: "LABOUR_NOT_ON_PROJECT",
      details: { labourId: arun },
    });
    expect(
      (
        await refusal(
          await remove(company.cookie, project, crypto.randomUUID(), {}),
          StatusCodes.NOT_FOUND,
        )
      ).code,
    ).toBe("LABOUR_NOT_FOUND");
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
      details: { field: "lastDay", labourId: bala },
    });
  });

  it("dates an add and a remove today in the Company's time zone when none is given", async () => {
    const company = await ownerWithCompany();
    const project = await addProject(company.workspaceId, company.userId);
    const arun = await labour(company, "Arun");
    const today = await companyToday(prisma, company.workspaceId);

    expect(
      (await add(company.cookie, project, { labourIds: [arun] })).status,
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
      await add(viewer.cookie, project, { labourIds: [bala] }),
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
      await add(picker.cookie, elsewhere, { labourIds: [bala] }),
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
      (await add(outsider.cookie, project, { labourIds: [bala] })).status,
    ).toBe(StatusCodes.NOT_FOUND);

    expect(
      (await add(editor.cookie, project, { labourIds: [bala] })).status,
    ).toBe(StatusCodes.NO_CONTENT);
    expect(
      (await remove(editor.cookie, project, bala, { lastDay: null })).status,
    ).toBe(StatusCodes.NO_CONTENT);
  });
});

describe("Site Engineers on a Project's Resources (ADR CM-0038 §3)", () => {
  it("lists Site Engineers on their own, leaves their sign-ins out of Team Members, and saves through the sign-ins", async () => {
    const company = await ownerWithCompany();
    const project = await addProject(company.workspaceId, company.userId);
    const anand = await engineerWithSignIn(company, "Anand", [project]);
    const bhaskar = await engineerWithSignIn(company, "Bhaskar");
    const chandran = await engineerRow(company, "Chandran");
    const durai = await engineerWithSignIn(company, "Durai");
    await prisma.constructionMastersSupervisor.update({
      where: { id: durai.id },
      data: { disabledAt: new Date() },
    });
    // An Office Staff sign-in linked before ADR CM-0037.
    const office = await memberWith(company, {});
    const elango = await engineerRow(company, "Elango", {
      teamMemberId: office.memberId,
    });
    const staff = await memberWith(company, {});
    await createTeamMemberHandlers().assignProjects({
      workspaceId: company.workspaceId,
      id: staff.memberId,
      by: company.userId,
      projectIds: [project],
    });

    const initial = await resources(company.cookie, project);
    expect(initial.siteEngineers).toEqual([
      {
        id: anand.id,
        name: "Anand",
        mobile: expect.any(String) as unknown,
        employeeCode: "SE-Ana",
        disabled: false,
      },
    ]);
    expect(initial.teamMembers.map((line) => line.id)).toEqual(
      expect.arrayContaining([staff.memberId]),
    );
    expect(initial.teamMembers.map((line) => line.id)).not.toContain(
      anand.memberId,
    );

    const choices = await json<{
      items: { id: string; name: string; hasSignIn: boolean }[];
    }>(await engineerOptions(company.cookie, project));
    expect(choices.items.map((item) => [item.name, item.hasSignIn])).toEqual([
      ["Bhaskar", true],
      ["Chandran", false],
      ["Elango", true],
    ]);
    const teamChoices = await json<{ items: { id: string }[] }>(
      await teamMemberOptions(
        jsonRequest(url(project, "/team-members/options"), company.cookie),
        params(project),
      ),
    );
    const teamChoiceIds = teamChoices.items.map((item) => item.id);
    for (const memberId of [
      anand.memberId,
      bhaskar.memberId,
      durai.memberId,
      office.memberId,
    ])
      expect(teamChoiceIds).not.toContain(memberId);
    expect(teamChoiceIds).toContain(staff.memberId);

    const saved = await setEngineers(
      company.cookie,
      project,
      [anand.id, bhaskar.id, elango],
      [anand.id],
    );
    expect(saved.status).toBe(StatusCodes.OK);
    expect(
      (await json<Resources>(saved)).siteEngineers.map((line) => line.name),
    ).toEqual(["Anand", "Bhaskar", "Elango"]);
    expect(await projectsOf(bhaskar.memberId)).toEqual([project]);
    expect(await projectsOf(office.memberId)).toEqual([project]);
    const audits = await prisma.constructionOrganizationAuditEvent.findMany({
      where: {
        workspaceId: company.workspaceId,
        action: "team_member.projects_changed",
        entityId: { in: [bhaskar.memberId, office.memberId] },
      },
    });
    expect(audits).toHaveLength(2);

    // A screen that loaded an older set gets 409, and nothing changes.
    const stale = await refusal(
      await setEngineers(company.cookie, project, [], [anand.id]),
      StatusCodes.CONFLICT,
    );
    expect(stale.code).toBe("PROJECT_RESOURCES_CHANGED");
    const current = [anand.id, bhaskar.id, elango];
    expect(
      (
        await refusal(
          await setEngineers(
            company.cookie,
            project,
            [...current, chandran],
            current,
          ),
          StatusCodes.CONFLICT,
        )
      ).code,
    ).toBe("SITE_ENGINEER_NO_SIGN_IN");
    expect(
      (
        await refusal(
          await setEngineers(
            company.cookie,
            project,
            [...current, durai.id],
            current,
          ),
          StatusCodes.BAD_REQUEST,
        )
      ).code,
    ).toBe("SUPERVISOR_DISABLED");
    expect(
      (
        await refusal(
          await setEngineers(
            company.cookie,
            project,
            [...current, crypto.randomUUID()],
            current,
          ),
          StatusCodes.BAD_REQUEST,
        )
      ).code,
    ).toBe("SUPERVISOR_NOT_FOUND");
    expect(await projectsOf(durai.memberId)).toEqual([]);

    // The Team Members save can neither drop nor add a Site Engineer's
    // sign-in, whatever it sends.
    const teamSaved = await setTeam(
      company.cookie,
      project,
      [durai.memberId],
      [staff.memberId, anand.memberId, bhaskar.memberId],
    );
    expect(teamSaved.status).toBe(StatusCodes.OK);
    const afterTeam = await json<Resources>(teamSaved);
    expect(afterTeam.siteEngineers.map((line) => line.name)).toEqual([
      "Anand",
      "Bhaskar",
      "Elango",
    ]);
    expect(await projectsOf(staff.memberId)).toEqual([]);
    expect(await projectsOf(durai.memberId)).toEqual([]);
    expect(await projectsOf(anand.memberId)).toEqual([project]);

    // Removing a Site Engineer takes only their sign-in off.
    const removed = await setEngineers(
      company.cookie,
      project,
      [anand.id, elango],
      current,
    );
    expect(removed.status).toBe(StatusCodes.OK);
    expect(await projectsOf(bhaskar.memberId)).toEqual([]);
    expect(await projectsOf(anand.memberId)).toEqual([project]);
  });

  it("needs the Project menu's Update and the Project", async () => {
    const company = await ownerWithCompany();
    const project = await addProject(company.workspaceId, company.userId);
    const elsewhere = await addProject(company.workspaceId, company.userId);
    const anand = await engineerWithSignIn(company, "Anand");

    const viewer = await memberOn(company, [project], {
      "projects.project": ["read"],
    });
    expect((await resources(viewer.cookie, project)).siteEngineers).toEqual([]);
    expect((await engineerOptions(viewer.cookie, project)).status).toBe(
      StatusCodes.FORBIDDEN,
    );
    expect(
      (await setEngineers(viewer.cookie, project, [anand.id], [])).status,
    ).toBe(StatusCodes.FORBIDDEN);

    const editor = await memberOn(company, [project], {
      "projects.project": ["read", "update"],
    });
    expect((await engineerOptions(editor.cookie, elsewhere)).status).toBe(
      StatusCodes.NOT_FOUND,
    );
    const notOn = await refusal(
      await setEngineers(editor.cookie, elsewhere, [anand.id], []),
      StatusCodes.NOT_FOUND,
    );
    expect(notOn.code).toBe("PROJECT_NOT_FOUND");
    expect(
      (await setEngineers(editor.cookie, project, [anand.id], [])).status,
    ).toBe(StatusCodes.OK);
  });

  it("is listed in the OpenAPI document", async () => {
    const document = await json<{
      paths: Record<string, Record<string, unknown>>;
    }>(getOpenApi());
    const base = "/api/construction/projects/projects/{id}/resources";
    for (const [path, method] of [
      [`${base}/site-engineers`, "post"],
      [`${base}/site-engineers/options`, "get"],
      [`${base}/labours`, "get"],
      [`${base}/labours`, "post"],
      [`${base}/labours/options`, "get"],
      [`${base}/labours/{labourId}/remove`, "post"],
    ] as const)
      expect(document.paths[path]?.[method], path).toBeDefined();
  });
});
