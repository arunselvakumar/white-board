import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it } from "vitest";

import { POST as setSiteEngineers } from "@/app/api/construction/projects/projects/[id]/resources/site-engineers/route";
import { createCheckInHandlers } from "@/src/labour/infrastructure/check-in-factory";
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
import { pngBytes } from "@/test/files";
import { TEST_ORIGIN, newEmail, newMobile } from "@/test/sessions";

import { POST as createSiteEngineer } from "../../route";
import { POST as deleteSiteEngineer } from "../delete/route";
import { POST as updateSiteEngineer } from "../update/route";
import { GET as getActivity } from "./route";

const API = `${TEST_ORIGIN}/api/construction`;
const SITE_ENGINEERS = `${API}/masters/site-engineers`;
const TODAY = todayIn("Asia/Kolkata");
const day = (offset: number) => addDays(TODAY, offset);
const PHOTO = Buffer.from(pngBytes(2048)).toString("base64");
/** Chennai; the Site fence's centre, and a place 300 m north of it. */
const SITE = { latitude: 13.0827, longitude: 80.2707 };
const NORTH = { latitude: 13.0857, longitude: 80.2707 };

type Company = Awaited<ReturnType<typeof ownerWithCompany>>;

type Entry = {
  id: string;
  kind: string;
  date: string;
  recordedAt: string;
  by: string | null;
  project: { id: string; name: string; canOpen: boolean };
  remark?: string | null;
  action?: string;
  at?: string;
  entryId?: string;
  hasPhoto?: boolean;
  location?: unknown;
  fence?: string | null;
  metresOutside?: number | null;
  voided?: { reason: string } | null;
};

type Page = { items: Entry[]; nextCursor: string | null };

/** An instant on the Company's wall clock (India, UTC+05:30). */
function at(date: string, time: string): Date {
  return new Date(`${date}T${time}:00+05:30`);
}

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

function request(cookie: string, id: string, query = "") {
  return getActivity(
    jsonRequest(`${SITE_ENGINEERS}/${id}/activity${query}`, cookie),
    params(id),
  );
}

async function page(cookie: string, id: string, query = "") {
  const response = await request(cookie, id, query);
  if (response.status !== 200)
    throw new Error(`activity: ${await response.text()}`);
  return (await response.json()) as Page;
}

async function everything(
  cookie: string,
  id: string,
  query = "",
): Promise<{ entries: Entry[]; pages: Page[] }> {
  const pages: Page[] = [];
  let cursor: string | null = null;
  do {
    const separator = query === "" ? "?" : "&";
    const next: Page = await page(
      cookie,
      id,
      cursor == null
        ? query
        : `${query}${separator}cursor=${encodeURIComponent(cursor)}`,
    );
    pages.push(next);
    cursor = next.nextCursor;
  } while (cursor != null);
  return { entries: pages.flatMap((one) => one.items), pages };
}

async function feed(cookie: string, id: string, query = "") {
  return (await everything(cookie, id, query)).entries;
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

type SiteEngineer = {
  id: string;
  name: string;
  mobile: string | null;
  email: string | null;
  updatedAt: string;
  signIn: { memberId: string | null };
};

/** A Site Engineer with a sign-in of their own (ADR CM-0037). */
async function addSiteEngineer(company: Company, projectIds: string[]) {
  const response = await createSiteEngineer(
    jsonRequest(SITE_ENGINEERS, company.cookie, {
      name: "Sundar Rajan",
      mobile: newMobile(),
      email: newEmail(),
      projectIds,
      profile: {},
      signIn: { invite: false, password: "first-pass-1234" },
    }),
  );
  if (response.status !== 201)
    throw new Error(`site engineer: ${await response.text()}`);
  return (await response.json()) as SiteEngineer;
}

/** A Project's Teams save of its Site Engineers. */
async function setTeamsSiteEngineers(
  company: Company,
  projectId: string,
  ids: string[],
  expectedIds: string[],
) {
  const response = await setSiteEngineers(
    jsonRequest(
      `${API}/projects/projects/${projectId}/resources/site-engineers`,
      company.cookie,
      { ids, expectedIds },
    ),
    params(projectId),
  );
  if (response.status !== 200)
    throw new Error(`teams: ${await response.text()}`);
}

/**
 * Sundar, added on Sky Towers, put on Green Park (which has a Site
 * fence) by Edit Site Engineer, checked in at both on earlier days (one
 * voided), taken off Sky Towers and put on Lake View by those Projects'
 * Teams saves.
 */
async function history(company: Company) {
  const [sky, green, lake] = await Promise.all([
    addProject(company.workspaceId, company.userId, "Sky Towers"),
    addProject(company.workspaceId, company.userId, "Green Park"),
    addProject(company.workspaceId, company.userId, "Lake View"),
  ]);
  await prisma.constructionHrmsBranch.create({
    data: {
      id: newId(),
      workspaceId: company.workspaceId,
      kind: "project_site",
      name: "Green Park site",
      projectId: green,
      latitude: SITE.latitude,
      longitude: SITE.longitude,
      radiusMetres: 100,
      createdBy: "test",
      updatedBy: "test",
    },
  });
  const engineer = await addSiteEngineer(company, [sky]);
  const edited = await updateSiteEngineer(
    jsonRequest(`${SITE_ENGINEERS}/${engineer.id}/update`, company.cookie, {
      name: engineer.name,
      mobile: engineer.mobile,
      email: engineer.email,
      projectIds: [sky, green],
      profile: {},
      expectedUpdatedAt: engineer.updatedAt,
    }),
    params(engineer.id),
  );
  if (edited.status !== 200) throw new Error(`update: ${await edited.text()}`);

  const clock = { now: new Date() };
  const handlers = createCheckInHandlers({ clock: () => clock.now });
  const record = async (
    projectId: string,
    action: "check_in" | "check_out",
    time: Date,
    location: { latitude: number; longitude: number } | null,
  ) => {
    clock.now = time;
    const result = await handlers.record({
      workspaceId: company.workspaceId,
      userId: company.userId,
      projectId,
      kind: "site_engineer",
      personId: engineer.id,
      action,
      photo: PHOTO,
      location: location == null ? null : { ...location, accuracyMetres: 9 },
    });
    return result.entry.id;
  };
  const mistaken = await record(sky, "check_in", at(day(-3), "08:00"), null);
  clock.now = at(day(-3), "08:05");
  await handlers.void({
    workspaceId: company.workspaceId,
    userId: company.userId,
    role: "owner",
    id: mistaken,
    reason: "Wrong person",
  });
  const skyIn = await record(sky, "check_in", at(day(-2), "09:00"), SITE);
  const greenIn = await record(green, "check_in", at(day(-1), "09:00"), SITE);
  const greenOut = await record(
    green,
    "check_out",
    at(day(-1), "18:00"),
    NORTH,
  );

  await setTeamsSiteEngineers(company, sky, [], [engineer.id]);
  await setTeamsSiteEngineers(company, lake, [engineer.id], []);
  return {
    sky,
    green,
    lake,
    id: engineer.id,
    memberId: engineer.signIn.memberId ?? "",
    mistaken,
    skyIn,
    greenIn,
    greenOut,
  };
}

function kinds(entries: readonly Entry[]) {
  return entries.map((entry) =>
    entry.kind === "check_in"
      ? [entry.kind, entry.entryId, entry.date]
      : [entry.kind, entry.project.name, entry.date],
  );
}

describe("Site Engineer Activity (ADR CM-0044 §7)", () => {
  it("shows the Projects their sign-in was added to and removed from, and each check-in entry with its fields", async () => {
    const company = await ownerWithCompany();
    const h = await history(company);
    const owner = await prisma.constructionOrganizationTeamMember.findFirst({
      where: { workspaceId: company.workspaceId, userId: company.userId },
      select: { name: true },
    });

    const all = await feed(company.cookie, h.id);
    expect(kinds(all)).toEqual([
      // Newest recorded first within today.
      ["project_added", "Lake View", TODAY],
      ["project_removed", "Sky Towers", TODAY],
      ["project_added", "Green Park", TODAY],
      ["project_added", "Sky Towers", TODAY],
      ["check_in", h.greenOut, day(-1)],
      ["check_in", h.greenIn, day(-1)],
      ["check_in", h.skyIn, day(-2)],
      ["check_in", h.mistaken, day(-3)],
    ]);
    const [, skyRemoved, , skyAdded, greenOut, greenIn, skyIn] = all;
    const sky = { id: h.sky, name: "Sky Towers", canOpen: true };
    expect(skyAdded).toMatchObject({
      kind: "project_added",
      project: sky,
      remark: null,
      by: owner?.name,
    });
    expect(skyRemoved).toMatchObject({
      kind: "project_removed",
      project: sky,
      remark: null,
      by: owner?.name,
    });
    expect(greenOut).toEqual({
      id: `check_in:${h.greenOut}`,
      kind: "check_in",
      date: day(-1),
      recordedAt: at(day(-1), "18:00").toISOString(),
      by: owner?.name,
      project: { id: h.green, name: "Green Park", canOpen: true },
      action: "check_out",
      at: at(day(-1), "18:00").toISOString(),
      entryId: h.greenOut,
      hasPhoto: true,
      location: { ...NORTH, accuracyMetres: 9 },
      fence: "outside",
      metresOutside: expect.any(Number) as number,
      voided: null,
    });
    expect(greenOut?.metresOutside).toBeGreaterThan(100);
    expect(greenIn).toMatchObject({ fence: "inside", metresOutside: 0 });
    // Sky Towers has no Site fence: the location is only saved.
    expect(skyIn).toMatchObject({
      fence: null,
      location: { ...SITE, accuracyMetres: 9 },
    });
    expect(all.at(-1)).toMatchObject({
      location: null,
      voided: { reason: "Wrong person" },
    });

    // Type, Project and dates.
    expect(kinds(await feed(company.cookie, h.id, "?type=projects"))).toEqual(
      kinds(all.filter((entry) => entry.kind !== "check_in")),
    );
    expect(await feed(company.cookie, h.id, "?type=check_ins")).toEqual(
      all.filter((entry) => entry.kind === "check_in"),
    );
    expect(
      kinds(await feed(company.cookie, h.id, `?projectId=${h.sky}`)),
    ).toEqual([
      ["project_removed", "Sky Towers", TODAY],
      ["project_added", "Sky Towers", TODAY],
      ["check_in", h.skyIn, day(-2)],
      ["check_in", h.mistaken, day(-3)],
    ]);
    expect(
      kinds(await feed(company.cookie, h.id, `?from=${day(-2)}&to=${day(-1)}`)),
    ).toEqual([
      ["check_in", h.greenOut, day(-1)],
      ["check_in", h.greenIn, day(-1)],
      ["check_in", h.skyIn, day(-2)],
    ]);

    for (const word of ["wage", "earned", "amount", "salary"])
      expect(JSON.stringify(all).toLowerCase()).not.toContain(word);
  });

  it("leaves out check-in entries without Attendance Read, and every entry of a Project the viewer is not on", async () => {
    const company = await ownerWithCompany();
    const h = await history(company);
    const ownerFeed = await feed(company.cookie, h.id);

    const withoutAttendance = await memberOn(
      company,
      { "masters.labours": ["read"] },
      [h.sky, h.green, h.lake],
    );
    expect(await feed(withoutAttendance.cookie, h.id)).toEqual(
      ownerFeed.filter((entry) => entry.kind !== "check_in"),
    );
    expect(
      await feed(withoutAttendance.cookie, h.id, "?type=check_ins"),
    ).toEqual([]);

    const onGreen = await memberOn(
      company,
      { "masters.labours": ["read"], "labour.attendance": ["read"] },
      [h.green],
    );
    expect(kinds(await feed(onGreen.cookie, h.id))).toEqual([
      ["project_added", "Green Park", TODAY],
      ["check_in", h.greenOut, day(-1)],
      ["check_in", h.greenIn, day(-1)],
    ]);
    expect(await feed(onGreen.cookie, h.id, `?projectId=${h.sky}`)).toEqual([]);
  });

  it("has check-in entries only for a Site Engineer without a sign-in", async () => {
    const company = await ownerWithCompany();
    const sky = await addProject(company.workspaceId, company.userId);
    const id = newId();
    await prisma.constructionMastersSupervisor.create({
      data: {
        id,
        workspaceId: company.workspaceId,
        name: "Older Site Engineer",
        createdBy: company.userId,
        updatedBy: company.userId,
      },
    });
    const entryId = newId();
    await prisma.constructionLabourCheckInEvent.create({
      data: {
        id: entryId,
        workspaceId: company.workspaceId,
        projectId: sky,
        personKind: "site_engineer",
        personId: id,
        action: "check_in",
        occurredAt: at(day(-1), "09:00"),
        attendanceDate: calendarDateToDb(day(-1)),
        photoRemovedAt: at(day(-1), "09:00"),
        createdBy: company.userId,
      },
    });
    expect(kinds(await feed(company.cookie, id))).toEqual([
      ["check_in", entryId, day(-1)],
    ]);
    expect(await feed(company.cookie, id, "?type=projects")).toEqual([]);
  });

  it("is 404 for another Company's or a deleted Site Engineer, and 403 without the Labours menu", async () => {
    const company = await ownerWithCompany();
    const other = await ownerWithCompany("Other Builders");
    const sky = await addProject(company.workspaceId, company.userId);
    const engineer = await addSiteEngineer(company, [sky]);

    const foreign = await request(other.cookie, engineer.id);
    expect(foreign.status).toBe(StatusCodes.NOT_FOUND);
    expect(((await foreign.json()) as { code: string }).code).toBe(
      "SUPERVISOR_NOT_FOUND",
    );

    const vendorsOnly = await memberOn(
      company,
      { "masters.vendors": ["read"], "labour.attendance": ["read"] },
      [sky],
    );
    expect((await request(vendorsOnly.cookie, engineer.id)).status).toBe(
      StatusCodes.FORBIDDEN,
    );

    const badCursor = await request(
      company.cookie,
      engineer.id,
      "?cursor=nope",
    );
    expect(badCursor.status).toBe(StatusCodes.BAD_REQUEST);

    const deleted = await deleteSiteEngineer(
      jsonRequest(
        `${SITE_ENGINEERS}/${engineer.id}/delete`,
        company.cookie,
        {},
      ),
      params(engineer.id),
    );
    expect(deleted.status).toBe(StatusCodes.NO_CONTENT);
    expect((await request(company.cookie, engineer.id)).status).toBe(
      StatusCodes.NOT_FOUND,
    );
  });

  it("pages across a boundary between check-in entries and Project entries of one instant without repeating or skipping one", async () => {
    const company = await ownerWithCompany();
    const [one, two] = await Promise.all([
      addProject(company.workspaceId, company.userId, "Tower One"),
      addProject(company.workspaceId, company.userId, "Tower Two"),
    ]);
    const engineer = await addSiteEngineer(company, []);
    // Oldest first: each day one Teams save puts the sign-in on both
    // Projects or takes it off both, ending off them, and the same instant
    // holds check-in entries, so only the kind's rank and the id order them.
    let checkIns = 0;
    for (let offset = 16; offset >= 1; offset--) {
      const date = day(-offset);
      const instant = at(date, "12:00");
      await prisma.constructionOrganizationAuditEvent.create({
        data: {
          id: newId(instant.getTime()),
          workspaceId: company.workspaceId,
          actorUserId: company.userId,
          action: "team_member.projects_changed",
          entityType: "team_member",
          entityId: engineer.signIn.memberId ?? "",
          before: {},
          after: { projectIds: offset % 2 === 0 ? [one, two] : [] },
          occurredAt: instant,
        },
      });
      const count = ((offset + 1) % 3) + 1;
      checkIns += count;
      await prisma.constructionLabourCheckInEvent.createMany({
        data: Array.from({ length: count }, (_, index) => ({
          id: newId(),
          workspaceId: company.workspaceId,
          projectId: one,
          personKind: "site_engineer" as const,
          personId: engineer.id,
          action:
            index % 2 === 0 ? ("check_in" as const) : ("check_out" as const),
          occurredAt: instant,
          attendanceDate: calendarDateToDb(date),
          photoRemovedAt: instant,
          createdBy: company.userId,
        })),
      });
    }

    const { entries, pages } = await everything(company.cookie, engineer.id);
    expect(entries).toHaveLength(16 * 2 + checkIns);
    expect(new Set(entries.map((entry) => entry.id)).size).toBe(entries.length);
    for (const one of pages) expect(one.items.length).toBeLessThanOrEqual(30);
    // The first page ends on a check-in entry, the next starts with a
    // Project entry of the same instant.
    const last = pages[0]?.items.at(-1);
    const next = pages[1]?.items[0];
    expect([last?.kind, next?.kind]).toEqual(["check_in", "project_added"]);
    expect(next?.recordedAt).toBe(last?.recordedAt);
    expect(
      entries.slice(0, 6).map((entry) => [entry.kind, entry.date]),
    ).toEqual([
      ["check_in", day(-1)],
      ["check_in", day(-1)],
      ["check_in", day(-1)],
      ["project_removed", day(-1)],
      ["project_removed", day(-1)],
      ["check_in", day(-2)],
    ]);

    const projects = await feed(company.cookie, engineer.id, "?type=projects");
    expect(projects).toEqual(
      entries.filter((entry) => entry.kind !== "check_in"),
    );
  });
});
