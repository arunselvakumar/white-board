import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it } from "vitest";

import { POST as setVendors } from "@/app/api/construction/projects/projects/[id]/resources/vendors/route";
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
import { TEST_ORIGIN } from "@/test/sessions";

import { POST as deleteVendor } from "../delete/route";
import { POST as updateVendor } from "../update/route";
import { POST as createVendor } from "../../route";
import { GET as getActivity } from "./route";

const API = `${TEST_ORIGIN}/api/construction`;
const VENDORS = `${API}/labour/vendors`;
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

function request(cookie: string, vendorId: string, query = "") {
  return getActivity(
    jsonRequest(`${VENDORS}/${vendorId}/activity${query}`, cookie),
    params(vendorId),
  );
}

async function page(cookie: string, vendorId: string, query = "") {
  const response = await request(cookie, vendorId, query);
  if (response.status !== 200)
    throw new Error(`activity: ${await response.text()}`);
  return (await response.json()) as Page;
}

async function everything(
  cookie: string,
  vendorId: string,
  query = "",
): Promise<{ entries: Entry[]; pages: Page[] }> {
  const pages: Page[] = [];
  let cursor: string | null = null;
  do {
    const separator = query === "" ? "?" : "&";
    const next: Page = await page(
      cookie,
      vendorId,
      cursor == null
        ? query
        : `${query}${separator}cursor=${encodeURIComponent(cursor)}`,
    );
    pages.push(next);
    cursor = next.nextCursor;
  } while (cursor != null);
  return { entries: pages.flatMap((one) => one.items), pages };
}

async function feed(cookie: string, vendorId: string, query = "") {
  return (await everything(cookie, vendorId, query)).entries;
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

type Vendor = { id: string; updatedAt: string };

async function addVendor(company: Company, projectIds: string[]) {
  const response = await createVendor(
    jsonRequest(VENDORS, company.cookie, {
      name: "Selvam Gang",
      joiningDate: day(-60),
      projectIds,
    }),
  );
  if (response.status !== 201)
    throw new Error(`vendor: ${await response.text()}`);
  return (await response.json()) as Vendor;
}

async function editVendor(
  company: Company,
  vendor: Vendor,
  changes: { name: string; projectIds: string[] },
) {
  const response = await updateVendor(
    jsonRequest(`${VENDORS}/${vendor.id}/update`, company.cookie, {
      joiningDate: day(-60),
      ...changes,
      expectedUpdatedAt: vendor.updatedAt,
    }),
    params(vendor.id),
  );
  if (response.status !== 200)
    throw new Error(`update: ${await response.text()}`);
  return (await response.json()) as Vendor;
}

/** A Project's Teams save of its Vendors. */
async function setTeamsVendors(
  company: Company,
  projectId: string,
  ids: string[],
  expectedIds: string[],
) {
  const response = await setVendors(
    jsonRequest(
      `${API}/projects/projects/${projectId}/resources/vendors`,
      company.cookie,
      { ids, expectedIds },
    ),
    params(projectId),
  );
  if (response.status !== 200)
    throw new Error(`teams: ${await response.text()}`);
}

/**
 * Selvam Gang, added on Sky Towers, then put on Green Park (which has a
 * Site fence) by Edit Vendor, renamed, checked in at Sky Towers and at
 * Green Park on earlier days (one voided), taken off Sky Towers and put
 * on Lake View by those Projects' Teams saves.
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
  let vendor = await addVendor(company, [sky]);
  vendor = await editVendor(company, vendor, {
    name: "Selvam Gang",
    projectIds: [sky, green],
  });
  // A save that keeps the Projects adds no entry.
  vendor = await editVendor(company, vendor, {
    name: "Selvam Gang (Madurai)",
    projectIds: [green, sky],
  });

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
      kind: "vendor",
      personId: vendor.id,
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
    reason: "Wrong gang",
  });
  const skyIn = await record(sky, "check_in", at(day(-2), "09:00"), SITE);
  const greenIn = await record(green, "check_in", at(day(-1), "09:00"), SITE);
  const greenOut = await record(
    green,
    "check_out",
    at(day(-1), "18:00"),
    NORTH,
  );

  await setTeamsVendors(company, sky, [], [vendor.id]);
  await setTeamsVendors(company, lake, [vendor.id], []);
  return {
    sky,
    green,
    lake,
    vendorId: vendor.id,
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

describe("Vendor Activity (ADR CM-0044 §7)", () => {
  it("records the Vendor's Projects in every command that changes them", async () => {
    const company = await ownerWithCompany();
    const h = await history(company);
    const events = await prisma.constructionOrganizationAuditEvent.findMany({
      where: { workspaceId: company.workspaceId, entityId: h.vendorId },
      orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
      select: { action: true, after: true },
    });
    // Add Vendor, Edit Vendor (twice) and two Teams saves each keep the
    // Vendor's whole set of Projects after the change.
    expect(
      events.map((event) => [
        event.action,
        [...(event.after as { projectIds: string[] }).projectIds].sort(),
      ]),
    ).toEqual([
      ["vendor.created", [h.sky]],
      ["vendor.updated", [h.sky, h.green].sort()],
      ["vendor.updated", [h.sky, h.green].sort()],
      ["vendor.projects_changed", [h.green]],
      ["vendor.projects_changed", [h.green, h.lake].sort()],
    ]);
  });

  it("shows the Projects added and removed, and each check-in entry with its fields", async () => {
    const company = await ownerWithCompany();
    const h = await history(company);
    const owner = await prisma.constructionOrganizationTeamMember.findFirst({
      where: { workspaceId: company.workspaceId, userId: company.userId },
      select: { name: true },
    });

    const all = await feed(company.cookie, h.vendorId);
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
    const [lakeAdded, skyRemoved, , skyAdded, greenOut, greenIn, skyIn] = all;
    const mistaken = all.at(-1);
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
    expect(lakeAdded?.project).toEqual({
      id: h.lake,
      name: "Lake View",
      canOpen: true,
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
      action: "check_in",
      fence: null,
      location: { ...SITE, accuracyMetres: 9 },
    });
    expect(mistaken).toMatchObject({
      location: null,
      voided: { reason: "Wrong gang" },
    });

    // Type, Project and dates.
    expect(
      kinds(await feed(company.cookie, h.vendorId, "?type=projects")),
    ).toEqual(kinds(all.filter((entry) => entry.kind !== "check_in")));
    expect(await feed(company.cookie, h.vendorId, "?type=check_ins")).toEqual(
      all.filter((entry) => entry.kind === "check_in"),
    );
    expect(
      kinds(await feed(company.cookie, h.vendorId, `?projectId=${h.sky}`)),
    ).toEqual([
      ["project_removed", "Sky Towers", TODAY],
      ["project_added", "Sky Towers", TODAY],
      ["check_in", h.skyIn, day(-2)],
      ["check_in", h.mistaken, day(-3)],
    ]);
    expect(
      kinds(
        await feed(
          company.cookie,
          h.vendorId,
          `?from=${day(-2)}&to=${day(-1)}`,
        ),
      ),
    ).toEqual([
      ["check_in", h.greenOut, day(-1)],
      ["check_in", h.greenIn, day(-1)],
      ["check_in", h.skyIn, day(-2)],
    ]);

    for (const word of ["wage", "earned", "amount", "rate", "balance"])
      expect(JSON.stringify(all).toLowerCase()).not.toContain(word);
  });

  it("leaves out check-in entries without Attendance Read, and every entry of a Project the viewer is not on", async () => {
    const company = await ownerWithCompany();
    const h = await history(company);
    const ownerFeed = await feed(company.cookie, h.vendorId);

    const withoutAttendance = await memberOn(
      company,
      { "masters.vendors": ["read"] },
      [h.sky, h.green, h.lake],
    );
    expect(await feed(withoutAttendance.cookie, h.vendorId)).toEqual(
      ownerFeed.filter((entry) => entry.kind !== "check_in"),
    );
    expect(
      await feed(withoutAttendance.cookie, h.vendorId, "?type=check_ins"),
    ).toEqual([]);

    const onGreen = await memberOn(
      company,
      { "masters.vendors": ["read"], "labour.attendance": ["read"] },
      [h.green],
    );
    expect(kinds(await feed(onGreen.cookie, h.vendorId))).toEqual([
      ["project_added", "Green Park", TODAY],
      ["check_in", h.greenOut, day(-1)],
      ["check_in", h.greenIn, day(-1)],
    ]);
    expect(
      await feed(onGreen.cookie, h.vendorId, `?projectId=${h.sky}`),
    ).toEqual([]);
  });

  it("is 404 for another Company's or a deleted Vendor, and 403 without the Vendors menu", async () => {
    const company = await ownerWithCompany();
    const other = await ownerWithCompany("Other Builders");
    const sky = await addProject(company.workspaceId, company.userId);
    const vendor = await addVendor(company, [sky]);

    const foreign = await request(other.cookie, vendor.id);
    expect(foreign.status).toBe(StatusCodes.NOT_FOUND);
    expect(((await foreign.json()) as { code: string }).code).toBe(
      "VENDOR_NOT_FOUND",
    );

    const labourOnly = await memberOn(
      company,
      { "masters.labours": ["read"], "labour.attendance": ["read"] },
      [sky],
    );
    expect((await request(labourOnly.cookie, vendor.id)).status).toBe(
      StatusCodes.FORBIDDEN,
    );

    const badCursor = await request(company.cookie, vendor.id, "?cursor=nope");
    expect(badCursor.status).toBe(StatusCodes.BAD_REQUEST);

    const deleted = await deleteVendor(
      jsonRequest(`${VENDORS}/${vendor.id}/delete`, company.cookie, {}),
      params(vendor.id),
    );
    expect(deleted.status).toBe(StatusCodes.NO_CONTENT);
    expect((await request(company.cookie, vendor.id)).status).toBe(
      StatusCodes.NOT_FOUND,
    );

    expect((await request(company.cookie, newId())).status).toBe(
      StatusCodes.NOT_FOUND,
    );
  });

  it("pages across a boundary between check-in entries and Project entries of one instant without repeating or skipping one", async () => {
    const company = await ownerWithCompany();
    const [one, two] = await Promise.all([
      addProject(company.workspaceId, company.userId, "Tower One"),
      addProject(company.workspaceId, company.userId, "Tower Two"),
    ]);
    const vendorId = newId();
    await prisma.constructionLabourVendor.create({
      data: {
        id: vendorId,
        workspaceId: company.workspaceId,
        name: "Raja Gang",
        joiningDate: calendarDateToDb(day(-60)),
        isActive: true,
        createdBy: company.userId,
        updatedBy: company.userId,
      },
    });
    // Oldest first: each day one Teams save puts the Vendor on both
    // Projects or takes it off both, and the same instant holds check-in
    // entries, so only the kind's rank and the id order them.
    let checkIns = 0;
    for (let offset = 16; offset >= 1; offset--) {
      const date = day(-offset);
      const instant = at(date, "12:00");
      await prisma.constructionOrganizationAuditEvent.create({
        data: {
          id: newId(instant.getTime()),
          workspaceId: company.workspaceId,
          actorUserId: company.userId,
          action: "vendor.projects_changed",
          entityType: "vendor",
          entityId: vendorId,
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
          personKind: "vendor" as const,
          personId: vendorId,
          action:
            index % 2 === 0 ? ("check_in" as const) : ("check_out" as const),
          occurredAt: instant,
          attendanceDate: calendarDateToDb(date),
          photoRemovedAt: instant,
          createdBy: company.userId,
        })),
      });
    }

    const { entries, pages } = await everything(company.cookie, vendorId);
    expect(entries).toHaveLength(16 * 2 + checkIns);
    expect(new Set(entries.map((entry) => entry.id)).size).toBe(entries.length);
    for (const one of pages) expect(one.items.length).toBeLessThanOrEqual(30);
    // The first page ends on a check-in entry, the next starts with a
    // Project entry of the same instant.
    const last = pages[0]?.items.at(-1);
    const next = pages[1]?.items[0];
    expect([last?.kind, next?.kind]).toEqual(["check_in", "project_added"]);
    expect(next?.recordedAt).toBe(last?.recordedAt);
    // Newest first, check-in entries before the Projects on one instant.
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

    const projects = await feed(company.cookie, vendorId, "?type=projects");
    expect(projects).toEqual(
      entries.filter((entry) => entry.kind !== "check_in"),
    );
  });
});
