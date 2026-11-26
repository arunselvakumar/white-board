import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it } from "vitest";

import type { ConstructionPersonAttendanceResponseModel } from "@/app/api/_lib/person-attendance-models";
import { createCheckInHandlers } from "@/src/labour/infrastructure/check-in-factory";
import type { Flag } from "@/src/shared-kernel/access";
import { addDays, todayIn } from "@/src/shared-kernel/calendar-date";
import {
  addProject,
  jsonRequest,
  memberWith,
  ownerWithCompany,
} from "@/test/companies";
import { pngBytes } from "@/test/files";
import { TEST_ORIGIN, newEmail, newMobile } from "@/test/sessions";

import { POST as createSiteEngineer } from "../../route";
import { GET as getAttendance } from "./route";

const SITE_ENGINEERS = `${TEST_ORIGIN}/api/construction/masters/site-engineers`;
const TODAY = todayIn("Asia/Kolkata");
const day = (offset: number) => addDays(TODAY, offset);
const PHOTO = Buffer.from(pngBytes(2048)).toString("base64");

type Company = Awaited<ReturnType<typeof ownerWithCompany>>;
type Page = ConstructionPersonAttendanceResponseModel;

/** An instant on the Company's wall clock (India, UTC+05:30). */
function at(date: string, time: string): Date {
  return new Date(`${date}T${time}:00+05:30`);
}

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

function read(cookie: string, id: string, query = "") {
  return getAttendance(
    jsonRequest(`${SITE_ENGINEERS}/${id}/attendance${query}`, cookie),
    params(id),
  );
}

async function page(cookie: string, id: string, query = "") {
  const response = await read(cookie, id, query);
  if (response.status !== 200)
    throw new Error(`attendance: ${await response.text()}`);
  return (await response.json()) as Page;
}

function days(result: Page) {
  return result.months.flatMap((month) => month.days);
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

/** A Site Engineer with a sign-in of their own (ADR CM-0037). */
async function addSiteEngineer(
  company: Company,
  projectIds: string[],
  joiningDate: string,
) {
  const response = await createSiteEngineer(
    jsonRequest(SITE_ENGINEERS, company.cookie, {
      name: "Sundar Rajan",
      mobile: newMobile(),
      email: newEmail(),
      projectIds,
      profile: { joiningDate },
      signIn: { password: "first-pass-1234" },
    }),
  );
  if (response.status !== 201)
    throw new Error(`site engineer: ${await response.text()}`);
  return ((await response.json()) as { id: string }).id;
}

/**
 * Sky Towers and Green Park, and Sundar on both, joined 40 days ago, with
 * check-in entries recorded through the Check-In handlers: three days ago
 * at Sky Towers 09:00 to 13:00 and 14:00 to 18:00; two days ago a night
 * shift at Green Park, 22:00 to 06:00 the next morning; yesterday at Sky
 * Towers a Check In at 09:00 voided, then one at 10:00 with no Check Out.
 */
async function history(company: Company) {
  const [sky, green] = await Promise.all([
    addProject(company.workspaceId, company.userId, "Sky Towers"),
    addProject(company.workspaceId, company.userId, "Green Park"),
  ]);
  const id = await addSiteEngineer(company, [sky, green], day(-40));

  const clock = { now: new Date() };
  const handlers = createCheckInHandlers({ clock: () => clock.now });
  const record = async (
    projectId: string,
    action: "check_in" | "check_out",
    time: Date,
  ) => {
    clock.now = time;
    const result = await handlers.record({
      workspaceId: company.workspaceId,
      userId: company.userId,
      projectId,
      kind: "site_engineer",
      personId: id,
      action,
      photo: PHOTO,
      location: null,
    });
    return result.entry.id;
  };
  await record(sky, "check_in", at(day(-3), "09:00"));
  await record(sky, "check_out", at(day(-3), "13:00"));
  await record(sky, "check_in", at(day(-3), "14:00"));
  await record(sky, "check_out", at(day(-3), "18:00"));
  await record(green, "check_in", at(day(-2), "22:00"));
  await record(green, "check_out", at(day(-1), "06:00"));
  const mistaken = await record(sky, "check_in", at(day(-1), "09:00"));
  clock.now = at(day(-1), "09:05");
  await handlers.void({
    workspaceId: company.workspaceId,
    userId: company.userId,
    role: "owner",
    id: mistaken,
    reason: "Wrong person",
  });
  await record(sky, "check_in", at(day(-1), "10:00"));
  return { sky, green, id };
}

describe("GET /api/construction/masters/site-engineers/{id}/attendance (ADR CM-0051)", () => {
  it("pairs each Check In with the next Check Out, per Project per day, and gives the all-time figures", async () => {
    const company = await ownerWithCompany();
    const { sky, green, id } = await history(company);

    const result = await page(company.cookie, id);
    expect(result).toMatchObject({
      measure: "hours",
      recordsAbsence: false,
      timeZone: "Asia/Kolkata",
      today: TODAY,
      firstMonth: day(-40).slice(0, 7),
      earlierTo: null,
    });
    expect(result.months.at(-1)?.month).toBe(TODAY.slice(0, 7));

    const [threeAgo, twoAgo, yesterday] = days(result);
    expect(threeAgo).toEqual({
      date: day(-3),
      status: "present",
      workedMinutes: 480,
      overtimeMinutes: 0,
      headDays: null,
      places: [
        {
          place: {
            kind: "project",
            id: sky,
            name: "Sky Towers",
            canOpen: true,
          },
          status: null,
          checkIn: "09:00",
          checkOut: "18:00",
          workedMinutes: 480,
          overtimeMinutes: 0,
          hoursFrom: "times",
          open: false,
          pending: false,
          heads: null,
        },
      ],
    });
    // The night shift stays on the day it began.
    expect(twoAgo).toMatchObject({ date: day(-2), workedMinutes: 480 });
    expect(twoAgo?.places).toEqual([
      expect.objectContaining({
        place: expect.objectContaining({ id: green }) as unknown,
        checkIn: "22:00",
        checkOut: "06:00",
        workedMinutes: 480,
        open: false,
      }),
    ]);
    // The voided Check In is left out; the open one adds no hours.
    expect(yesterday).toMatchObject({
      date: day(-1),
      status: "present",
      workedMinutes: 0,
    });
    expect(yesterday?.places).toEqual([
      expect.objectContaining({
        checkIn: "10:00",
        checkOut: null,
        open: true,
        workedMinutes: 0,
      }),
    ]);
    expect(days(result)).toHaveLength(3);

    expect(result.allTime).toEqual({
      firstDay: day(-3),
      lastDay: day(-1),
      daysWorked: 3,
      workedMinutes: 960,
      overtimeMinutes: 0,
      headDays: 0,
      places: 2,
    });
    for (const word of ["wage", "earned", "amount", "salary"])
      expect(JSON.stringify(result).toLowerCase()).not.toContain(word);
  });

  it("pages back a month at a time to the first month, all-time only on the first page", async () => {
    const company = await ownerWithCompany();
    const { id } = await history(company);
    const thisMonth = TODAY.slice(0, 7);
    const firstMonth = day(-40).slice(0, 7);

    const latest = await page(company.cookie, id, "?months=1");
    expect(latest.months.map((m) => m.month)).toEqual([thisMonth]);
    expect(latest.earlierTo).not.toBeNull();
    expect(latest.allTime).not.toBeNull();

    const earliest = await page(
      company.cookie,
      id,
      `?to=${firstMonth}&months=1`,
    );
    expect(earliest.months.map((m) => m.month)).toEqual([firstMonth]);
    expect(earliest.earlierTo).toBeNull();
    expect(earliest.allTime).toBeNull();

    const before = await page(company.cookie, id, "?to=2001-01");
    expect(before.months).toEqual([]);
    expect(before.earlierTo).toBeNull();
  });

  it("counts only the Projects the viewer has Attendance Read on (ADR CM-0044 §4)", async () => {
    const company = await ownerWithCompany();
    const { sky, green, id } = await history(company);

    const onSky = await memberOn(
      company,
      { "masters.labours": ["read"], "labour.attendance": ["read"] },
      [sky],
    );
    const result = await page(onSky.cookie, id);
    expect(days(result).map((d) => [d.date, d.places[0]?.place.name])).toEqual([
      [day(-3), "Sky Towers"],
      [day(-1), "Sky Towers"],
    ]);
    expect(result.allTime).toMatchObject({
      places: 1,
      workedMinutes: 480,
      daysWorked: 2,
    });

    const withoutAttendance = await memberOn(
      company,
      { "masters.labours": ["read"] },
      [sky, green],
    );
    const blind = await page(withoutAttendance.cookie, id);
    expect(days(blind)).toEqual([]);
    expect(blind.allTime).toMatchObject({ daysWorked: 0, places: 0 });
  });

  it("starts at the day they were added when that is before their joining date", async () => {
    const company = await ownerWithCompany();
    const sky = await addProject(company.workspaceId, company.userId);
    const id = await addSiteEngineer(company, [sky], day(40));
    const result = await page(company.cookie, id);
    expect(result.firstMonth).toBe(TODAY.slice(0, 7));
    expect(result.months.map((m) => m.month)).toEqual([TODAY.slice(0, 7)]);
    expect(days(result)).toEqual([]);
  });

  it("needs Labours Read, a real Site Engineer of the Company and a real month", async () => {
    const company = await ownerWithCompany();
    const other = await ownerWithCompany("Other Builders");
    const { sky, id } = await history(company);

    const vendorsOnly = await memberOn(
      company,
      { "masters.vendors": ["read"], "labour.attendance": ["read"] },
      [sky],
    );
    expect((await read(vendorsOnly.cookie, id)).status).toBe(
      StatusCodes.FORBIDDEN,
    );

    const foreign = await read(other.cookie, id);
    expect(foreign.status).toBe(StatusCodes.NOT_FOUND);
    expect(((await foreign.json()) as { code: string }).code).toBe(
      "SUPERVISOR_NOT_FOUND",
    );
    const missing = "0195f0a0-0000-7000-8000-000000000999";
    expect((await read(company.cookie, missing)).status).toBe(
      StatusCodes.NOT_FOUND,
    );
    expect((await read(company.cookie, id, "?to=2026-13")).status).toBe(
      StatusCodes.BAD_REQUEST,
    );
    expect((await read(company.cookie, id, "?months=13")).status).toBe(
      StatusCodes.BAD_REQUEST,
    );
  });
});
