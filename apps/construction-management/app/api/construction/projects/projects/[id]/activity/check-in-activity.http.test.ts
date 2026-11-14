import { prisma } from "@repo/construction-db";
import { describe, expect, it } from "vitest";

import { POST as createLabour } from "@/app/api/construction/labour/labours/route";
import { POST as createSiteEngineer } from "@/app/api/construction/masters/site-engineers/route";
import { createCheckInHandlers } from "@/src/labour/infrastructure/check-in-factory";
import type { Flag } from "@/src/shared-kernel/access";
import {
  addDays,
  calendarDateFromDb,
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

import { GET as getActivity } from "./route";

const API = `${TEST_ORIGIN}/api/construction`;
const LABOURS = `${API}/labour/labours`;
const TODAY = todayIn("Asia/Kolkata");
const day = (offset: number) => addDays(TODAY, offset);
const PHOTO = Buffer.from(pngBytes(2048)).toString("base64");
/** Chennai; the Site fence's centre. */
const SITE = { latitude: 13.0827, longitude: 80.2707 };

type Company = Awaited<ReturnType<typeof ownerWithCompany>>;

type Entry = {
  id: string;
  kind: string;
  date: string;
  recordedAt: string;
  by: string | null;
  person?: {
    kind: string;
    id: string;
    name: string;
    role: string | null;
    canOpen: boolean;
  };
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

async function page(cookie: string, projectId: string, query = "") {
  const response = await getActivity(
    jsonRequest(
      `${API}/projects/projects/${projectId}/activity${query}`,
      cookie,
    ),
    params(projectId),
  );
  if (response.status !== 200)
    throw new Error(`activity: ${await response.text()}`);
  return (await response.json()) as Page;
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
    const next: Page = await page(
      cookie,
      projectId,
      cursor == null
        ? query
        : `${query}${separator}cursor=${encodeURIComponent(cursor)}`,
    );
    entries.push(...next.items);
    cursor = next.nextCursor;
  } while (cursor != null);
  return entries;
}

function checkIns(entries: readonly Entry[]): Entry[] {
  return entries.filter((entry) => entry.kind === "check_in");
}

function ids(entries: readonly Entry[]): string[] {
  return entries.map((entry) => entry.id);
}

async function memberOn(
  company: Company,
  permissions: Record<string, Flag[]>,
  projectIds: string[],
) {
  const member = await memberWith(company, permissions);
  await prisma.constructionOrganizationTeamMemberProject.createMany({
    data: projectIds.map((projectId) => ({
      memberId: member.memberId,
      projectId,
    })),
  });
  return member;
}

async function mason(workspaceId: string) {
  const found = await prisma.constructionMastersLabourCategory.findFirst({
    where: { workspaceId, name: "Mason" },
  });
  if (found != null) return found.id;
  const id = newId();
  await prisma.constructionMastersLabourCategory.create({
    data: {
      id,
      workspaceId,
      name: "Mason",
      createdBy: "test",
      updatedBy: "test",
    },
  });
  return id;
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
      labourCategoryId: await mason(company.workspaceId),
    }),
  );
  if (response.status !== 201)
    throw new Error(`labour: ${await response.text()}`);
  return ((await response.json()) as { id: string }).id;
}

async function siteEngineerOn(
  company: Company,
  name: string,
  projectId: string,
) {
  const response = await createSiteEngineer(
    jsonRequest(`${API}/masters/site-engineers`, company.cookie, {
      name,
      mobile: newMobile(),
      email: newEmail(),
      projectIds: [projectId],
      profile: {},
      signIn: { invite: false, password: "first-pass-1234" },
    }),
  );
  if (response.status !== 201)
    throw new Error(`site engineer: ${await response.text()}`);
  return ((await response.json()) as { id: string }).id;
}

async function vendorOn(company: Company, name: string, projectId: string) {
  const id = newId();
  await prisma.constructionLabourVendor.create({
    data: {
      id,
      workspaceId: company.workspaceId,
      name,
      joiningDate: calendarDateToDb(day(-40)),
      isActive: true,
      createdBy: "test",
      updatedBy: "test",
      projects: { create: [{ projectId }] },
    },
  });
  return id;
}

/**
 * Sky Towers with a Site fence, and on it Murugan (a Mason), Sundar (a
 * Site Engineer) and Selvam Gang (a Vendor). Sundar checks in outside the
 * fence two days ago; Selvam Gang is checked in and voided; Murugan works
 * a night shift that began yesterday.
 */
async function history(company: Company) {
  const sky = await addProject(
    company.workspaceId,
    company.userId,
    "Sky Towers",
  );
  await prisma.constructionHrmsBranch.create({
    data: {
      id: newId(),
      workspaceId: company.workspaceId,
      kind: "project_site",
      name: "Sky Towers site",
      projectId: sky,
      latitude: SITE.latitude,
      longitude: SITE.longitude,
      radiusMetres: 100,
      createdBy: "test",
      updatedBy: "test",
    },
  });
  const murugan = await labourOn(company, "Murugan Ganesan", sky);
  const sundar = await siteEngineerOn(company, "Sundar", sky);
  const selvam = await vendorOn(company, "Selvam Gang", sky);

  const clock = { now: new Date() };
  const handlers = createCheckInHandlers({ clock: () => clock.now });
  const record = async (
    kind: "labour" | "site_engineer" | "vendor",
    personId: string,
    action: "check_in" | "check_out",
    time: Date,
    location: { latitude: number; longitude: number } | null = null,
  ) => {
    clock.now = time;
    const result = await handlers.record({
      workspaceId: company.workspaceId,
      userId: company.userId,
      projectId: sky,
      kind,
      personId,
      action,
      photo: PHOTO,
      location,
    });
    return result.entry.id;
  };
  const sundarIn = await record(
    "site_engineer",
    sundar,
    "check_in",
    at(day(-2), "09:00"),
    { latitude: SITE.latitude + 0.003, longitude: SITE.longitude },
  );
  const selvamIn = await record(
    "vendor",
    selvam,
    "check_in",
    at(day(-2), "09:05"),
    SITE,
  );
  clock.now = at(day(-2), "09:10");
  await handlers.void({
    workspaceId: company.workspaceId,
    userId: company.userId,
    id: selvamIn,
    reason: "Wrong gang",
  });
  const muruganIn = await record(
    "labour",
    murugan,
    "check_in",
    at(day(-1), "22:00"),
    SITE,
  );
  const muruganOut = await record(
    "labour",
    murugan,
    "check_out",
    at(TODAY, "05:30"),
  );
  return {
    sky,
    murugan,
    sundar,
    selvam,
    sundarIn,
    selvamIn,
    muruganIn,
    muruganOut,
  };
}

describe("Project Activity: check-in entries (ADR CM-0044)", () => {
  it("shows everyone's Check In and Check Out, one entry each, with who, role, place and void", async () => {
    const company = await ownerWithCompany();
    const h = await history(company);
    const owner = await prisma.constructionOrganizationTeamMember.findFirst({
      where: { workspaceId: company.workspaceId, userId: company.userId },
      select: { name: true },
    });

    const all = await everything(company.cookie, h.sky);
    const entries = checkIns(all);
    expect(
      entries.map((entry) => [entry.entryId, entry.date, entry.action]),
    ).toEqual([
      // The night shift's Check Out sits on the day it began.
      [h.muruganOut, day(-1), "check_out"],
      [h.muruganIn, day(-1), "check_in"],
      [h.selvamIn, day(-2), "check_in"],
      [h.sundarIn, day(-2), "check_in"],
    ]);
    const [out, inside, voided, outside] = entries;
    expect(out).toEqual({
      id: `check_in:${h.muruganOut}`,
      kind: "check_in",
      date: day(-1),
      recordedAt: at(TODAY, "05:30").toISOString(),
      by: owner?.name,
      person: {
        kind: "labour",
        id: h.murugan,
        name: "Murugan Ganesan",
        role: "Mason",
        canOpen: true,
      },
      action: "check_out",
      at: at(TODAY, "05:30").toISOString(),
      entryId: h.muruganOut,
      hasPhoto: true,
      location: null,
      fence: null,
      metresOutside: null,
      voided: null,
    });
    expect(inside).toMatchObject({
      fence: "inside",
      metresOutside: 0,
      location: { ...SITE, accuracyMetres: null },
    });
    expect(voided).toMatchObject({
      person: {
        kind: "vendor",
        id: h.selvam,
        name: "Selvam Gang",
        role: "Vendor",
        canOpen: true,
      },
      voided: { reason: "Wrong gang" },
    });
    expect(outside).toMatchObject({
      person: {
        kind: "site_engineer",
        id: h.sundar,
        name: "Sundar",
        role: "Site Engineer",
        canOpen: true,
      },
      fence: "outside",
    });
    expect(outside?.metresOutside).toBeGreaterThan(100);
    // The team changes are still there beside them.
    expect(all.map((entry) => entry.kind)).toEqual(
      expect.arrayContaining(["labour_added", "site_engineer_added"]),
    );

    for (const word of ["wage", "earned", "amount", "rate"])
      expect(JSON.stringify(entries).toLowerCase()).not.toContain(word);
  });

  it("filters by Type and by Who, Vendors included", async () => {
    const company = await ownerWithCompany();
    const h = await history(company);
    const all = await everything(company.cookie, h.sky);
    const kinds = async (query: string) =>
      (await everything(company.cookie, h.sky, query)).map((entry) =>
        entry.kind === "check_in"
          ? `check_in:${entry.person?.kind ?? ""}`
          : entry.kind,
      );

    expect(await everything(company.cookie, h.sky, "?type=team")).toEqual(
      all.filter((entry) => entry.kind !== "check_in"),
    );
    expect(await everything(company.cookie, h.sky, "?type=check_ins")).toEqual(
      checkIns(all),
    );
    expect(await kinds("?who=vendors")).toEqual(["check_in:vendor"]);
    // Vendors have no team entries in this feed.
    expect(await kinds("?type=team&who=vendors")).toEqual([]);
    expect(await kinds("?who=labours")).toEqual([
      "check_in:labour",
      "check_in:labour",
      "labour_added",
    ]);
    expect(await kinds("?who=site_engineers")).toEqual([
      "site_engineer_added",
      "check_in:site_engineer",
    ]);
    expect(await kinds("?type=check_ins&who=site_engineers")).toEqual([
      "check_in:site_engineer",
    ]);
    expect(
      (
        await everything(
          company.cookie,
          h.sky,
          `?type=check_ins&from=${day(-2)}&to=${day(-2)}`,
        )
      ).map((entry) => entry.entryId),
    ).toEqual([h.selvamIn, h.sundarIn]);

    const wrong = await getActivity(
      jsonRequest(
        `${API}/projects/projects/${h.sky}/activity?type=punches`,
        company.cookie,
      ),
      params(h.sky),
    );
    expect(wrong.status).toBe(400);
  });

  it("shows check-in entries only with Attendance Read on the Project, and links people by their menus", async () => {
    const company = await ownerWithCompany();
    const h = await history(company);
    const ownerFeed = await everything(company.cookie, h.sky);

    const reader = await memberOn(company, { "projects.project": ["read"] }, [
      h.sky,
    ]);
    const plain = await everything(reader.cookie, h.sky);
    // The feed as before: every entry but the check-in entries.
    expect(ids(plain)).toEqual(
      ids(ownerFeed.filter((entry) => entry.kind !== "check_in")),
    );
    expect(await everything(reader.cookie, h.sky, "?type=check_ins")).toEqual(
      [],
    );

    const attendance = await memberOn(
      company,
      { "projects.project": ["read"], "labour.attendance": ["read"] },
      [h.sky],
    );
    const seen = checkIns(await everything(attendance.cookie, h.sky));
    expect(ids(seen)).toEqual(ids(checkIns(ownerFeed)));
    // Named, but no page to open without Labours or Vendors Read.
    for (const entry of seen) expect(entry.person?.canOpen).toBe(false);

    const vendors = await memberOn(
      company,
      {
        "projects.project": ["read"],
        "labour.attendance": ["read"],
        "masters.vendors": ["read"],
      },
      [h.sky],
    );
    const open = new Map(
      checkIns(await everything(vendors.cookie, h.sky)).map((entry) => [
        entry.person?.kind ?? "",
        entry.person?.canOpen ?? null,
      ]),
    );
    expect(Object.fromEntries(open)).toEqual({
      labour: false,
      site_engineer: false,
      vendor: true,
    });

    // A deleted person keeps their name, without a link.
    await prisma.constructionLabourVendor.update({
      where: { id: h.selvam },
      data: { deletedAt: new Date(), deletedBy: company.userId },
    });
    const vendorEntry = checkIns(
      await everything(company.cookie, h.sky, "?who=vendors"),
    )[0];
    expect(vendorEntry?.person).toMatchObject({
      name: "Selvam Gang",
      canOpen: false,
    });
  });

  it("pages across check-in and team entries on the same instant without repeating or skipping one", async () => {
    const company = await ownerWithCompany();
    const sky = await addProject(
      company.workspaceId,
      company.userId,
      "Sky Towers",
    );
    const murugan = await labourOn(company, "Murugan Ganesan", sky);
    const selvam = await vendorOn(company, "Selvam Gang", sky);
    const added = await prisma.constructionLabourTransfer.findFirstOrThrow({
      where: { labourId: murugan, toProjectId: sky },
    });
    const seed = async (date: string, instant: Date, count: number) => {
      await prisma.constructionLabourCheckInEvent.createMany({
        data: Array.from({ length: count }, (_, index) => ({
          id: newId(),
          workspaceId: company.workspaceId,
          projectId: sky,
          personKind:
            index % 2 === 0 ? ("labour" as const) : ("vendor" as const),
          personId: index % 2 === 0 ? murugan : selvam,
          action: "check_in" as const,
          occurredAt: instant,
          attendanceDate: calendarDateToDb(date),
          // Seeded without a photo: as after retention removed it.
          photoRemovedAt: instant,
          createdBy: company.userId,
        })),
      });
    };
    for (let offset = -27; offset <= -1; offset++)
      await seed(day(offset), at(day(offset), "10:00"), 1);
    // Three on the very instant and day the Labour was added.
    const addedOn = calendarDateFromDb(added.transferDate);
    await seed(addedOn, added.createdAt, 3);

    const before = await everything(company.cookie, sky);
    expect(before).toHaveLength(27 + 3 + 1);
    const first = await page(company.cookie, sky);
    expect(first.items).toHaveLength(30);
    // The page ends on a check-in entry; the next starts on the Labour
    // added at the same instant.
    expect(
      [first.items.at(-1), before[30]].map((entry) => [
        entry?.kind,
        entry?.date,
        entry?.recordedAt,
      ]),
    ).toEqual([
      ["check_in", addedOn, added.createdAt.toISOString()],
      ["labour_added", addedOn, added.createdAt.toISOString()],
    ]);

    // One newer than the first page, one among the pages still to read.
    await seed(TODAY, at(TODAY, "08:00"), 1);
    // Recorded earlier on that day: after the cursor.
    await seed(addedOn, new Date(added.createdAt.getTime() - 3_600_000), 1);

    const rest: Entry[] = [];
    let cursor = first.nextCursor;
    while (cursor != null) {
      const next = await page(
        company.cookie,
        sky,
        `?cursor=${encodeURIComponent(cursor)}`,
      );
      rest.push(...next.items);
      cursor = next.nextCursor;
    }
    const seen = [...first.items, ...rest];
    expect(new Set(ids(seen)).size).toBe(seen.length);
    const fresh = seen.filter(
      (entry) => !before.some((old) => old.id === entry.id),
    );
    expect(fresh.map((entry) => [entry.kind, entry.date])).toEqual([
      ["check_in", addedOn],
    ]);
    expect(seen.filter((entry) => !fresh.includes(entry))).toEqual(before);
    const now = await everything(company.cookie, sky);
    expect(now).toHaveLength(before.length + 2);
    expect(new Set(ids(now)).size).toBe(now.length);
  });
});
