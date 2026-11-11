import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it } from "vitest";

import { POST as deleteLabour } from "@/app/api/construction/labour/labours/[id]/delete/route";
import { POST as updateLabour } from "@/app/api/construction/labour/labours/[id]/update/route";
import { POST as createLabour } from "@/app/api/construction/labour/labours/route";
import { POST as transferLabours } from "@/app/api/construction/labour/labours/transfer/route";
import { POST as deleteSiteEngineer } from "@/app/api/construction/masters/site-engineers/[id]/delete/route";
import { POST as updateSiteEngineer } from "@/app/api/construction/masters/site-engineers/[id]/update/route";
import { POST as createSiteEngineer } from "@/app/api/construction/masters/site-engineers/route";
import { GET as getOpenApi } from "@/app/api/openapi.json/route";
import { createLabourHandlers } from "@/src/labour/infrastructure/create-labour-handlers";
import type { Flag } from "@/src/shared-kernel/access";
import { addDays, todayIn } from "@/src/shared-kernel/calendar-date";
import { newId } from "@/src/shared-kernel/ids";
import {
  addProject,
  jsonRequest,
  memberWith,
  ownerWithCompany,
} from "@/test/companies";
import { TEST_ORIGIN, newEmail, newMobile } from "@/test/sessions";

import { GET as getActivity } from "./route";

const API = `${TEST_ORIGIN}/api/construction`;
const LABOURS = `${API}/labour/labours`;
const SITE_ENGINEERS = `${API}/masters/site-engineers`;
const TODAY = todayIn("Asia/Kolkata");
const day = (offset: number) => addDays(TODAY, offset);

type Company = Awaited<ReturnType<typeof ownerWithCompany>>;

type Person = {
  id: string | null;
  name: string;
  labourCode?: string | null;
  labourCategory?: string | null;
  canOpen: boolean;
};

type Entry = {
  id: string;
  kind: string;
  date: string;
  recordedAt: string;
  by: string | null;
  labours?: Person[];
  fromProject?: { id: string; name: string; canOpen: boolean } | null;
  toProject?: { id: string; name: string; canOpen: boolean } | null;
  remark?: string | null;
  siteEngineer?: Person;
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
    ...(entry.labours?.map((labour) => labour.name) ?? [
      entry.siteEngineer?.name,
    ]),
  ]);
}

async function labourOn(company: Company, name: string, projectId: string) {
  const response = await createLabour(
    jsonRequest(LABOURS, company.cookie, {
      name,
      joiningDate: day(-40),
      wageType: "daily",
      wagePerDay: 70_000,
      overtimeWagePerHour: 10_000,
      weeklyHolidays: [],
      projectIds: [projectId],
    }),
  );
  if (response.status !== 201)
    throw new Error(`labour: ${await response.text()}`);
  return (await json<{ id: string }>(response)).id;
}

async function siteEngineer(
  company: Company,
  name: string,
  projectIds: string[],
) {
  const response = await createSiteEngineer(
    jsonRequest(SITE_ENGINEERS, company.cookie, {
      name,
      mobile: newMobile(),
      email: newEmail(),
      projectIds,
      profile: {},
      signIn: { invite: false, password: "first-pass-1234" },
    }),
  );
  if (response.status !== 201)
    throw new Error(`site engineer: ${await response.text()}`);
  return json<{ id: string; updatedAt: string; mobile: string; email: string }>(
    response,
  );
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
 * Sky Towers and Green Park. Three Labours imported onto Sky Towers in one
 * import 30 days ago; Ravi and Selvi moved from Green Park to Sky Towers in
 * one transfer 5 days ago; Ganesh moved from Sky Towers to Green Park 3
 * days ago; Kumar taken off Sky Towers on Edit Labour today (last day
 * yesterday) and then deleted. Karthik added as a Site Engineer on Sky
 * Towers and taken off on Edit; Meena added and then deleted.
 */
async function history(company: Company) {
  const [sky, green] = await Promise.all([
    addProject(company.workspaceId, company.userId, "Sky Towers"),
    addProject(company.workspaceId, company.userId, "Green Park"),
  ]);
  // A new Company has the seeded Labour Categories; add Mason if not.
  const masons = await prisma.constructionMastersLabourCategory.count({
    where: { workspaceId: company.workspaceId, name: "Mason" },
  });
  if (masons === 0)
    await prisma.constructionMastersLabourCategory.create({
      data: {
        id: newId(),
        workspaceId: company.workspaceId,
        name: "Mason",
        createdBy: "test",
        updatedBy: "test",
      },
    });
  const row = (number: number, name: string) => ({
    row: number,
    cells: {
      name,
      joiningDate: day(-30),
      wageType: "Daily",
      wagePerDay: 650,
      overtimeWagePerHour: 80,
      projects: "Sky Towers",
      labourCategory: "Mason",
    },
  });
  await createLabourHandlers().importer.commit({
    workspaceId: company.workspaceId,
    by: company.userId,
    sheet: [row(2, "Kumar"), row(3, "Ganesh"), row(4, "Arul")],
  });
  const imported = await prisma.constructionLabourLabour.findMany({
    where: { workspaceId: company.workspaceId },
  });
  const idOf = (name: string) =>
    imported.find((labour) => labour.name === name)?.id ?? "";

  const ravi = await labourOn(company, "Ravi", green);
  const selvi = await labourOn(company, "Selvi", green);
  const moved = await transferLabours(
    jsonRequest(`${LABOURS}/transfer`, company.cookie, {
      labourIds: [selvi, ravi],
      fromProjectId: green,
      toProjectId: sky,
      transferDate: day(-5),
      remark: "Slab casting",
    }),
  );
  expect(moved.status).toBe(StatusCodes.OK);
  const out = await transferLabours(
    jsonRequest(`${LABOURS}/transfer`, company.cookie, {
      labourIds: [idOf("Ganesh")],
      fromProjectId: sky,
      toProjectId: green,
      transferDate: day(-3),
    }),
  );
  expect(out.status).toBe(StatusCodes.OK);

  const kumar = await prisma.constructionLabourLabour.findUniqueOrThrow({
    where: { id: idOf("Kumar") },
  });
  const untick = await updateLabour(
    jsonRequest(`${LABOURS}/${kumar.id}/update`, company.cookie, {
      name: "Kumar",
      joiningDate: day(-30),
      wageType: "daily",
      projectIds: [],
      expectedUpdatedAt: kumar.updatedAt.toISOString(),
    }),
    params(kumar.id),
  );
  expect(untick.status).toBe(StatusCodes.OK);
  const deleted = await deleteLabour(
    jsonRequest(`${LABOURS}/${kumar.id}/delete`, company.cookie, {}),
    params(kumar.id),
  );
  expect(deleted.status).toBe(StatusCodes.NO_CONTENT);

  const karthik = await siteEngineer(company, "Karthik Raja", [sky]);
  const offSky = await updateSiteEngineer(
    jsonRequest(`${SITE_ENGINEERS}/${karthik.id}/update`, company.cookie, {
      name: "Karthik Raja",
      mobile: karthik.mobile,
      email: karthik.email,
      projectIds: [],
      profile: {},
      expectedUpdatedAt: karthik.updatedAt,
    }),
    params(karthik.id),
  );
  expect(offSky.status).toBe(StatusCodes.OK);
  const meena = await siteEngineer(company, "Meena", [sky, green]);
  const gone = await deleteSiteEngineer(
    jsonRequest(`${SITE_ENGINEERS}/${meena.id}/delete`, company.cookie, {}),
    params(meena.id),
  );
  expect(gone.status).toBe(StatusCodes.NO_CONTENT);
  return { sky, green, karthik: karthik.id, meena: meena.id, kumar: kumar.id };
}

const SKY = [
  ["site_engineer_removed", TODAY, "Meena"],
  ["site_engineer_added", TODAY, "Meena"],
  ["site_engineer_removed", TODAY, "Karthik Raja"],
  ["site_engineer_added", TODAY, "Karthik Raja"],
  ["labour_removed", day(-1), "Kumar"],
  ["transferred_out", day(-3), "Ganesh"],
  ["transferred_in", day(-5), "Ravi", "Selvi"],
  ["labour_added", day(-30), "Arul", "Ganesh", "Kumar"],
];

describe("Project Activity (ADR CM-0038)", () => {
  it("shows Site Engineers and Labours added and removed, transfers, and a batch as one entry", async () => {
    const company = await ownerWithCompany();
    const { sky, green, karthik, meena, kumar } = await history(company);
    const owner = await prisma.constructionOrganizationTeamMember.findFirst({
      where: { workspaceId: company.workspaceId, userId: company.userId },
      select: { name: true },
    });

    const entries = await everything(company.cookie, sky);
    expect(summary(entries)).toEqual(SKY);
    for (const entry of entries) expect(entry.by).toBe(owner?.name);
    const [meenaOff, , karthikOff, , removed, out, transferIn, batch] = entries;
    expect(meenaOff?.siteEngineer).toEqual({
      id: meena,
      name: "Meena",
      canOpen: false,
    });
    expect(karthikOff?.siteEngineer).toEqual({
      id: karthik,
      name: "Karthik Raja",
      canOpen: true,
    });
    expect(removed?.labours).toEqual([
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
    expect(batch?.labours).toHaveLength(3);
    expect(batch?.labours?.[0]).toEqual({
      id: expect.any(String) as string,
      name: "Arul",
      labourCode: null,
      labourCategory: "Mason",
      canOpen: true,
    });

    // Transfers seen from the other side; Meena was on Green Park too.
    expect(summary(await everything(company.cookie, green))).toEqual([
      ["site_engineer_removed", TODAY, "Meena"],
      ["site_engineer_added", TODAY, "Meena"],
      ["transferred_in", day(-3), "Ganesh"],
      ["transferred_out", day(-5), "Ravi", "Selvi"],
      ["labour_added", day(-40), "Selvi"],
      ["labour_added", day(-40), "Ravi"],
    ]);
    const greenEntries = await everything(company.cookie, green);
    expect(greenEntries[2]?.fromProject).toMatchObject({ id: sky });
    expect(JSON.stringify(entries).toLowerCase()).not.toMatch(
      /wage|amount|attendance/,
    );
  });

  it("filters by who and by date range", async () => {
    const company = await ownerWithCompany();
    const { sky } = await history(company);
    expect(
      summary(await everything(company.cookie, sky, "?who=site_engineers")),
    ).toEqual(SKY.slice(0, 4));
    expect(
      summary(await everything(company.cookie, sky, "?who=labours")),
    ).toEqual(SKY.slice(4));
    expect(
      summary(
        await everything(company.cookie, sky, `?from=${day(-5)}&to=${day(-1)}`),
      ),
    ).toEqual(SKY.slice(4, 7));
    expect((await read(company.cookie, sky, "?who=everyone")).status).toBe(
      StatusCodes.BAD_REQUEST,
    );
    expect(
      (await read(company.cookie, sky, `?from=${day(-1)}&to=${day(-5)}`))
        .status,
    ).toBe(StatusCodes.BAD_REQUEST);
  });

  it("needs Project Read and the viewer on the Project; links people only with Labours Read", async () => {
    const company = await ownerWithCompany();
    const { sky, green } = await history(company);

    const onSky = await memberOn(company, { "projects.project": ["read"] }, [
      sky,
    ]);
    const seen = await everything(onSky.cookie, sky);
    expect(summary(seen)).toEqual(SKY);
    for (const entry of seen) {
      for (const labour of entry.labours ?? [])
        expect(labour.canOpen).toBe(false);
      if (entry.siteEngineer != null)
        expect(entry.siteEngineer.canOpen).toBe(false);
    }
    // Green Park is not theirs: named, not linked.
    expect(seen[5]?.toProject).toMatchObject({
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
