import { prisma } from "@repo/construction-db";
import { describe, expect, it } from "vitest";

import { POST as createLabour } from "@/app/api/construction/labour/labours/route";
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

import { GET as getActivity } from "./route";

const LABOURS = `${TEST_ORIGIN}/api/construction/labour/labours`;
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
  project?: { id: string; name: string; canOpen: boolean };
  action?: string;
  at?: string;
  entryId?: string;
  hasPhoto?: boolean;
  location?: {
    latitude: number;
    longitude: number;
    accuracyMetres: number | null;
  } | null;
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

async function page(cookie: string, labourId: string, query = "") {
  const response = await getActivity(
    jsonRequest(`${LABOURS}/${labourId}/activity${query}`, cookie),
    params(labourId),
  );
  if (response.status !== 200)
    throw new Error(`activity: ${await response.text()}`);
  return (await response.json()) as Page;
}

async function everything(
  cookie: string,
  labourId: string,
  query = "",
): Promise<Entry[]> {
  const entries: Entry[] = [];
  let cursor: string | null = null;
  do {
    const separator = query === "" ? "?" : "&";
    const next: Page = await page(
      cookie,
      labourId,
      cursor == null
        ? query
        : `${query}${separator}cursor=${encodeURIComponent(cursor)}`,
    );
    entries.push(...next.items);
    cursor = next.nextCursor;
  } while (cursor != null);
  return entries;
}

async function labourOn(company: Company, projectIds: string[]) {
  const response = await createLabour(
    jsonRequest(LABOURS, company.cookie, {
      name: "Dhuresh Nawin",
      joiningDate: day(-40),
      wageType: "daily",
      wagePerDay: 70_000,
      overtimeWagePerHour: 10_000,
      weeklyHolidays: [],
      projectIds,
    }),
  );
  if (response.status !== 201)
    throw new Error(`labour: ${await response.text()}`);
  return ((await response.json()) as { id: string }).id;
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

async function seedFence(workspaceId: string, projectId: string) {
  await prisma.constructionHrmsBranch.create({
    data: {
      id: newId(),
      workspaceId,
      kind: "project_site",
      name: "Green Park site",
      projectId,
      latitude: SITE.latitude,
      longitude: SITE.longitude,
      radiusMetres: 100,
      createdBy: "test",
      updatedBy: "test",
    },
  });
}

/**
 * Sky Towers (no Site fence) and Green Park (a fence), and Dhuresh on
 * both: a night shift at Sky Towers that began yesterday, a day at Green
 * Park three days ago (in inside the fence, out outside it), and a Check
 * In at Sky Towers four days ago that was voided.
 */
async function history(company: Company) {
  const [sky, green] = await Promise.all([
    addProject(company.workspaceId, company.userId, "Sky Towers"),
    addProject(company.workspaceId, company.userId, "Green Park"),
  ]);
  await seedFence(company.workspaceId, green);
  const labourId = await labourOn(company, [sky, green]);
  const clock = { now: at(day(-4), "09:00") };
  const handlers = createCheckInHandlers({ clock: () => clock.now });
  const record = async (
    projectId: string,
    action: "check_in" | "check_out",
    time: Date,
    location: { latitude: number; longitude: number } | null = null,
  ) => {
    clock.now = time;
    const result = await handlers.record({
      workspaceId: company.workspaceId,
      userId: company.userId,
      projectId,
      kind: "labour",
      personId: labourId,
      action,
      photo: PHOTO,
      location: location == null ? null : { ...location, accuracyMetres: 12 },
    });
    return result.entry.id;
  };
  const mistaken = await record(sky, "check_in", at(day(-4), "09:00"), SITE);
  clock.now = at(day(-4), "09:10");
  await handlers.void({
    workspaceId: company.workspaceId,
    userId: company.userId,
    id: mistaken,
    reason: "Wrong person",
  });
  const greenIn = await record(green, "check_in", at(day(-3), "09:00"), SITE);
  const greenOut = await record(green, "check_out", at(day(-3), "18:00"), {
    latitude: SITE.latitude + 0.003,
    longitude: SITE.longitude,
  });
  const nightIn = await record(sky, "check_in", at(day(-1), "22:00"));
  const nightOut = await record(sky, "check_out", at(TODAY, "05:30"));
  return {
    sky,
    green,
    labourId,
    mistaken,
    greenIn,
    greenOut,
    nightIn,
    nightOut,
  };
}

function checkIns(entries: readonly Entry[]): Entry[] {
  return entries.filter((entry) => entry.kind === "check_in");
}

describe("Labour Activity: check-in entries (ADR CM-0044)", () => {
  it("shows each Check In and Check Out on its attendance day, with photo, location, fence and void", async () => {
    const company = await ownerWithCompany();
    const h = await history(company);
    const owner = await prisma.constructionOrganizationTeamMember.findFirst({
      where: { workspaceId: company.workspaceId, userId: company.userId },
      select: { name: true },
    });

    const all = await everything(company.cookie, h.labourId);
    const entries = checkIns(all);
    expect(entries.map((entry) => [entry.entryId, entry.date])).toEqual([
      // The night shift's Check Out sits on the day it began.
      [h.nightOut, day(-1)],
      [h.nightIn, day(-1)],
      [h.greenOut, day(-3)],
      [h.greenIn, day(-3)],
      [h.mistaken, day(-4)],
    ]);
    const [nightOut, , greenOut, greenIn, mistaken] = entries;
    const skyRef = { id: h.sky, name: "Sky Towers", canOpen: true };
    const greenRef = { id: h.green, name: "Green Park", canOpen: true };
    expect(nightOut).toEqual({
      id: `check_in:${h.nightOut}`,
      kind: "check_in",
      date: day(-1),
      recordedAt: at(TODAY, "05:30").toISOString(),
      by: owner?.name,
      project: skyRef,
      action: "check_out",
      at: at(TODAY, "05:30").toISOString(),
      entryId: h.nightOut,
      hasPhoto: true,
      location: null,
      fence: null,
      metresOutside: null,
      voided: null,
    });
    expect(greenIn).toMatchObject({
      project: greenRef,
      action: "check_in",
      location: { ...SITE, accuracyMetres: 12 },
      fence: "inside",
      metresOutside: 0,
    });
    expect(greenOut).toMatchObject({ action: "check_out", fence: "outside" });
    expect(greenOut?.metresOutside).toBeGreaterThan(100);
    // A location on a Project without a Site fence, and a void that stays.
    expect(mistaken).toMatchObject({
      project: skyRef,
      location: { ...SITE, accuracyMetres: 12 },
      fence: null,
      voided: { reason: "Wrong person" },
    });

    // Beside the day's attendance entry, which they add up to.
    const yesterday = all.filter((entry) => entry.date === day(-1));
    expect(yesterday.map((entry) => entry.kind).sort()).toEqual([
      "attendance",
      "check_in",
      "check_in",
    ]);

    // Type: Check-In is its own; Attendance keeps meaning the day.
    const typed = await everything(
      company.cookie,
      h.labourId,
      "?type=check_ins",
    );
    expect(typed).toEqual(entries);
    const attendance = await everything(
      company.cookie,
      h.labourId,
      "?type=attendance",
    );
    expect(checkIns(attendance)).toEqual([]);
    expect(attendance.length).toBeGreaterThan(0);
    expect(
      checkIns(
        await everything(company.cookie, h.labourId, `?projectId=${h.green}`),
      ).map((entry) => entry.entryId),
    ).toEqual([h.greenOut, h.greenIn]);
    expect(
      checkIns(
        await everything(
          company.cookie,
          h.labourId,
          `?from=${day(-4)}&to=${day(-3)}`,
        ),
      ).map((entry) => entry.entryId),
    ).toEqual([h.greenOut, h.greenIn, h.mistaken]);

    // Once retention removed the photo.
    await prisma.constructionLabourCheckInEvent.update({
      where: { id: h.greenIn },
      data: { photoKey: null, photoRemovedAt: new Date() },
    });
    const removed = checkIns(
      await everything(company.cookie, h.labourId, "?type=check_ins"),
    ).find((entry) => entry.entryId === h.greenIn);
    expect(removed?.hasPhoto).toBe(false);

    for (const word of ["wage", "earned", "amount", "rate"])
      expect(JSON.stringify(entries).toLowerCase()).not.toContain(word);
  });

  it("shows check-in entries only of Projects where the viewer has Attendance Read", async () => {
    const company = await ownerWithCompany();
    const h = await history(company);
    const ownerFeed = await everything(company.cookie, h.labourId);

    const withoutAttendance = await memberOn(
      company,
      { "masters.labours": ["read"] },
      [h.sky, h.green],
    );
    const plain = await everything(withoutAttendance.cookie, h.labourId);
    // Exactly the feed as before: everything but the check-in entries.
    expect(plain).toEqual(
      ownerFeed.filter((entry) => entry.kind !== "check_in"),
    );
    expect(
      await everything(withoutAttendance.cookie, h.labourId, "?type=check_ins"),
    ).toEqual([]);

    const onSky = await memberOn(
      company,
      { "masters.labours": ["read"], "labour.attendance": ["read"] },
      [h.sky],
    );
    expect(
      checkIns(await everything(onSky.cookie, h.labourId)).map(
        (entry) => entry.entryId,
      ),
    ).toEqual([h.nightOut, h.nightIn, h.mistaken]);
    expect(
      await everything(
        onSky.cookie,
        h.labourId,
        `?type=check_ins&projectId=${h.green}`,
      ),
    ).toEqual([]);
  });

  it("pages across check-in and other entries on the same instant without repeating or skipping one", async () => {
    const company = await ownerWithCompany();
    const sky = await addProject(
      company.workspaceId,
      company.userId,
      "Sky Towers",
    );
    const labourId = await labourOn(company, [sky]);
    let seeded = 0;
    const seedDay = async (date: string, checkInsThatDay: number) => {
      seeded += checkInsThatDay;
      // The attendance row and the check-in entries share one instant, so
      // only the kind's rank and the id order them.
      const instant = at(date, "18:00");
      await prisma.constructionLabourAttendance.create({
        data: {
          id: newId(),
          workspaceId: company.workspaceId,
          projectId: sky,
          labourId,
          attendanceDate: calendarDateToDb(date),
          status: "present",
          wageType: "daily",
          wageRate: 70_000,
          earned: 70_000,
          createdAt: instant,
          createdBy: company.userId,
          updatedBy: company.userId,
        },
      });
      await prisma.constructionLabourCheckInEvent.createMany({
        data: Array.from({ length: checkInsThatDay }, (_, index) => ({
          id: newId(),
          workspaceId: company.workspaceId,
          projectId: sky,
          personKind: "labour" as const,
          personId: labourId,
          action:
            index % 2 === 0 ? ("check_in" as const) : ("check_out" as const),
          occurredAt: instant,
          attendanceDate: calendarDateToDb(date),
          // Seeded without a photo: as after retention removed it.
          photoRemovedAt: instant,
          createdBy: company.userId,
        })),
      });
    };
    for (let offset = -35; offset <= -1; offset++)
      await seedDay(day(offset), (-offset % 4) + 1);

    const before = await everything(company.cookie, labourId);
    // 35 days, their check-in entries, the Project added, Added to Labours.
    expect(before).toHaveLength(35 + seeded + 2);
    expect(new Set(before.map((entry) => entry.id)).size).toBe(before.length);

    const first = await page(company.cookie, labourId);
    expect(first.items).toHaveLength(30);
    // The boundary falls inside a day, between a check-in entry and the
    // day's attendance entry of the same instant.
    expect(
      [first.items.at(-1), before[30]].map((entry) => [
        entry?.kind,
        entry?.date,
        entry?.recordedAt,
      ]),
    ).toEqual([
      ["check_in", day(-9), at(day(-9), "18:00").toISOString()],
      ["attendance", day(-9), at(day(-9), "18:00").toISOString()],
    ]);

    // One newer than the first page, one among the pages still to read.
    await seedDay(TODAY, 1);
    await seedDay(day(-38), 2);

    const rest: Entry[] = [];
    let cursor = first.nextCursor;
    while (cursor != null) {
      const next = await page(
        company.cookie,
        labourId,
        `?cursor=${encodeURIComponent(cursor)}`,
      );
      expect(next.items.length).toBeLessThanOrEqual(30);
      rest.push(...next.items);
      cursor = next.nextCursor;
    }
    const seen = [...first.items, ...rest];
    expect(new Set(seen.map((entry) => entry.id)).size).toBe(seen.length);
    const added = seen.filter(
      (entry) => !before.some((old) => old.id === entry.id),
    );
    expect(added.map((entry) => [entry.kind, entry.date])).toEqual([
      ["check_in", day(-38)],
      ["check_in", day(-38)],
      ["attendance", day(-38)],
    ]);
    expect(seen.filter((entry) => !added.includes(entry))).toEqual(before);

    // Read with type=check_ins, the pages hold only those, all of them.
    const onlyCheckIns = await everything(
      company.cookie,
      labourId,
      "?type=check_ins",
    );
    expect(onlyCheckIns).toHaveLength(seeded);
    expect(onlyCheckIns).toEqual(
      checkIns(await everything(company.cookie, labourId)),
    );
  });
});
