import { randomUUID } from "node:crypto";

import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it } from "vitest";

import type { PermissionGrants } from "@/src/shared-kernel/access";
import { addDays, type CalendarDate } from "@/src/shared-kernel/calendar-date";
import {
  companyTimezone,
  companyToday,
} from "@/src/shared-kernel/company-today";
import { zoneInstant } from "@/src/shared-kernel/zone-time";
import { jsonRequest, memberWith, ownerWithCompany } from "@/test/companies";
import { TEST_ORIGIN } from "@/test/sessions";

import { POST as moveStage } from "../companies/[id]/stage/route";
import { POST as createCompany } from "../companies/route";
import { POST as markDone } from "../follow-ups/[id]/done/route";
import { POST as createFollowUp } from "../follow-ups/route";
import { POST as addNote } from "../visits/[id]/notes/route";
import { POST as createVisit } from "../visits/route";
import { GET as getDashboard } from "./route";

const BASE = `${TEST_ORIGIN}/api/construction/marketing`;

type Session = { cookie: string; userId: string };

type Ref = { id: string; name: string };

type Dashboard = {
  period: { kind: string; from: string; to: string };
  scope: "own" | "team" | "person";
  canViewTeam: boolean;
  people: { id: string; name: string; active: boolean }[] | null;
  totals: Record<
    | "visitsCompleted"
    | "visitsPlanned"
    | "visitsMissed"
    | "followUpsDueToday"
    | "followUpsOverdue"
    | "newCompanies"
    | "companiesWon",
    number | null
  >;
  today: {
    visits:
      { id: string; status: string; checkedIn: boolean; company: Ref }[] | null;
    followUps: { id: string; type: string; company: Ref }[] | null;
  };
  perPerson:
    | {
        memberId: string;
        active: boolean;
        completed: number;
        target: number | null;
      }[]
    | null;
  stages: {
    counts: { stage: string; count: number }[];
    wonInPeriod: number;
    lostInPeriod: number;
  } | null;
  overTime: {
    bucket: "day" | "week";
    points: { start: string; completed: number; missed: number }[];
  } | null;
  recent:
    | {
        kind: string;
        at: string;
        by: Ref | null;
        company: Ref;
        visit: { id: string; number: string } | null;
        text: string;
      }[]
    | null;
  hotWithoutFollowUp:
    | {
        id: string;
        name: string;
        lastVisitAt: string;
        assignedTo: Ref | null;
      }[]
    | null;
};

type Company = {
  id: string;
  name: string;
  updatedAt: string;
  contacts: { id: string }[];
};

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });

const DASHBOARD: PermissionGrants = { "marketing.dashboard": ["read"] };

const MARKETING: PermissionGrants = {
  ...DASHBOARD,
  "marketing.visits": ["create", "read", "update"],
  "marketing.follow_ups": ["create", "read", "update"],
  "marketing.companies": ["create", "read", "update"],
};

const MANAGER: PermissionGrants = {
  "marketing.dashboard": ["read", "view_all"],
  "marketing.visits": ["create", "read", "update"],
  "marketing.follow_ups": ["create", "read", "update"],
  "marketing.companies": ["create", "read", "update"],
};

async function dashboard(
  who: Session,
  query: Record<string, string> = {},
  status: number = StatusCodes.OK,
): Promise<Dashboard> {
  const search = new URLSearchParams(query).toString();
  const response = await getDashboard(
    jsonRequest(
      `${BASE}/dashboard${search === "" ? "" : `?${search}`}`,
      who.cookie,
    ),
  );
  expect(response.status).toBe(status);
  return json<Dashboard>(response);
}

async function refused(
  who: Session,
  query: Record<string, string>,
): Promise<{ status: number; code: string }> {
  const response = await getDashboard(
    jsonRequest(
      `${BASE}/dashboard?${new URLSearchParams(query).toString()}`,
      who.cookie,
    ),
  );
  return {
    status: response.status,
    code: (await json<{ code: string }>(response)).code,
  };
}

async function aCompany(
  who: Session,
  body: Record<string, unknown> = {},
): Promise<Company> {
  const response = await createCompany(
    jsonRequest(`${BASE}/companies`, who.cookie, {
      name: `Kaveri Steel ${randomUUID().slice(0, 6)}`,
      primaryContact: { name: "Lakshmi" },
      ...body,
    }),
  );
  expect(response.status).toBe(StatusCodes.CREATED);
  return json<Company>(response);
}

/** Noon of the Company's today, or another day: clear of midnight either way. */
async function noon(workspaceId: string, days = 0): Promise<Date> {
  const [today, timeZone] = await Promise.all([
    companyToday(prisma, workspaceId),
    companyTimezone(prisma, workspaceId),
  ]);
  return zoneInstant(addDays(today, days), 12 * 60, timeZone);
}

async function logVisit(
  who: Session,
  company: Company,
  visitAt: Date,
  body: Record<string, unknown> = {},
): Promise<{ id: string; number: string }> {
  const response = await createVisit(
    jsonRequest(`${BASE}/visits`, who.cookie, {
      status: "completed",
      prospectCompanyId: company.id,
      visitAt: visitAt.toISOString(),
      contactIds: company.contacts.map((contact) => contact.id),
      discussion: "Needs a 40 m PEB shed near Sulur.",
      ...body,
    }),
  );
  expect(response.status).toBe(StatusCodes.CREATED);
  return json<{ id: string; number: string }>(response);
}

async function planVisit(
  who: Session,
  company: Company,
  body: Record<string, unknown> = {},
): Promise<{ id: string }> {
  const response = await createVisit(
    jsonRequest(`${BASE}/visits`, who.cookie, {
      status: "planned",
      prospectCompanyId: company.id,
      visitAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
      ...body,
    }),
  );
  expect(response.status).toBe(StatusCodes.CREATED);
  return json<{ id: string }>(response);
}

async function aFollowUp(
  who: Session,
  company: Company,
  dueDate: CalendarDate,
  body: Record<string, unknown> = {},
): Promise<{ id: string; updatedAt: string }> {
  const response = await createFollowUp(
    jsonRequest(`${BASE}/follow-ups`, who.cookie, {
      prospectCompanyId: company.id,
      type: "call",
      dueDate,
      ...body,
    }),
  );
  expect(response.status).toBe(StatusCodes.CREATED);
  return json<{ id: string; updatedAt: string }>(response);
}

async function stage(
  who: Session,
  company: { id: string; updatedAt: string },
  body: Record<string, unknown>,
): Promise<Company> {
  const response = await moveStage(
    jsonRequest(`${BASE}/companies/${company.id}/stage`, who.cookie, {
      expectedUpdatedAt: company.updatedAt,
      ...body,
    }),
    params(company.id),
  );
  expect(response.status).toBe(StatusCodes.OK);
  return json<Company>(response);
}

async function latestCompany(
  id: string,
): Promise<{ id: string; updatedAt: string }> {
  const row =
    await prisma.constructionMarketingProspectCompany.findUniqueOrThrow({
      where: { id },
      select: { id: true, updatedAt: true },
    });
  return { id: row.id, updatedAt: row.updatedAt.toISOString() };
}

/** Yesterday to tomorrow: every figure below is clear of the period's edges. */
async function aroundToday(workspaceId: string) {
  const today = await companyToday(prisma, workspaceId);
  return {
    today,
    query: {
      period: "custom",
      from: addDays(today, -1),
      to: addDays(today, 1),
    },
  };
}

const stageCount = (found: Dashboard, name: string) =>
  found.stages?.counts.find((row) => row.stage === name)?.count;

describe("Marketing Dashboard (ADR CM-0040 §13)", () => {
  it("counts the member's own records, the team's with View all, or one person's", async () => {
    const owner = await ownerWithCompany();
    const ravi = await memberWith(owner, MARKETING);
    const priya = await memberWith(owner, MARKETING);
    const manager = await memberWith(owner, MANAGER);
    const { query } = await aroundToday(owner.workspaceId);
    const yesterday = await noon(owner.workspaceId, -1);
    const kaveri = await aCompany(ravi);
    const pandian = await aCompany(priya);
    await logVisit(ravi, kaveri, yesterday);
    await logVisit(priya, pandian, yesterday);
    await logVisit(priya, pandian, yesterday);

    const own = await dashboard(ravi, query);
    expect(own).toMatchObject({
      scope: "own",
      canViewTeam: false,
      people: null,
      perPerson: null,
      totals: { visitsCompleted: 1, newCompanies: 1 },
    });

    const team = await dashboard(manager, query);
    expect(team).toMatchObject({
      scope: "team",
      canViewTeam: true,
      totals: { visitsCompleted: 3, newCompanies: 2 },
    });
    const ids = team.people?.map((person) => person.id);
    expect(ids).toEqual(
      expect.arrayContaining([ravi.memberId, priya.memberId]),
    );
    const row = (memberId: string) =>
      team.perPerson?.find((person) => person.memberId === memberId);
    expect(row(ravi.memberId)).toMatchObject({ completed: 1, target: null });
    expect(row(priya.memberId)).toMatchObject({ completed: 2, target: null });

    const one = await dashboard(manager, {
      ...query,
      memberId: priya.memberId,
    });
    expect(one).toMatchObject({
      scope: "person",
      totals: { visitsCompleted: 2, newCompanies: 1 },
    });
    // The Owner holds View all: the team's figures by default.
    expect((await dashboard(owner, query)).scope).toBe("team");
  });

  it("measures this month's completed Visits against the month's target", async () => {
    const owner = await ownerWithCompany();
    const ravi = await memberWith(owner, MARKETING);
    const today = await companyToday(prisma, owner.workspaceId);
    await prisma.constructionMarketingVisitTarget.create({
      data: {
        id: randomUUID(),
        workspaceId: owner.workspaceId,
        memberId: ravi.memberId,
        effectiveMonth: new Date(`${today.slice(0, 7)}-01T00:00:00Z`),
        target: 20,
        createdBy: owner.userId,
        updatedBy: owner.userId,
      },
    });
    const month = await dashboard(owner, { period: "this_month" });
    expect(
      month.perPerson?.find((person) => person.memberId === ravi.memberId)
        ?.target,
    ).toBe(20);
    // A target is monthly: none for a week, nor for last month before it was set.
    const week = await dashboard(owner, { period: "this_week" });
    expect(week.perPerson?.every((person) => person.target == null)).toBe(true);
    const last = await dashboard(owner, { period: "last_month" });
    expect(
      last.perPerson?.find((person) => person.memberId === ravi.memberId)
        ?.target,
    ).toBeNull();
  });

  it("leaves out each section whose menu the member cannot read", async () => {
    const owner = await ownerWithCompany();
    const onlyDashboard = await memberWith(owner, DASHBOARD);
    const visitsOnly = await memberWith(owner, {
      ...DASHBOARD,
      "marketing.visits": ["create", "read"],
    });

    const bare = await dashboard(onlyDashboard);
    expect(bare).toMatchObject({
      totals: {
        visitsCompleted: null,
        visitsPlanned: null,
        visitsMissed: null,
        followUpsDueToday: null,
        followUpsOverdue: null,
        newCompanies: null,
        companiesWon: null,
      },
      today: { visits: null, followUps: null },
      stages: null,
      overTime: null,
      recent: null,
      hotWithoutFollowUp: null,
    });

    const visits = await dashboard(visitsOnly);
    expect(visits.totals).toMatchObject({
      visitsCompleted: 0,
      followUpsDueToday: null,
      newCompanies: null,
      companiesWon: null,
    });
    expect(visits.today).toEqual({ visits: [], followUps: null });
    expect(visits.overTime).not.toBeNull();
    expect(visits.stages).toBeNull();
    expect(visits.recent).toEqual([]);
    // Hot without a Follow-up needs Companies, Visits and Follow-ups read.
    expect(visits.hotWithoutFollowUp).toBeNull();
  });

  it("counts a Planned Visit whose time passed as Missed unless someone checked in", async () => {
    const owner = await ownerWithCompany();
    const ravi = await memberWith(owner, MARKETING);
    const { today, query } = await aroundToday(owner.workspaceId);
    const yesterday = await noon(owner.workspaceId, -1);
    const company = await aCompany(ravi);
    const missed = await planVisit(ravi, company);
    const checkedIn = await planVisit(ravi, company);
    await planVisit(ravi, company, {
      visitAt: (await noon(owner.workspaceId, 1)).toISOString(),
    });
    await logVisit(ravi, company, yesterday);
    // Moved to yesterday; one was checked in at the site.
    await prisma.constructionMarketingVisit.updateMany({
      where: { id: { in: [missed.id, checkedIn.id] } },
      data: { visitAt: yesterday },
    });
    await prisma.constructionMarketingVisit.update({
      where: { id: checkedIn.id },
      data: {
        checkInAt: yesterday,
        checkInBy: ravi.userId,
        checkInLocation: "unavailable",
      },
    });

    const found = await dashboard(ravi, query);
    expect(found.totals).toMatchObject({
      visitsCompleted: 1,
      visitsPlanned: 2,
      visitsMissed: 1,
    });
    // Three days, one point each, zeros kept.
    expect(found.overTime).toEqual({
      bucket: "day",
      points: [
        { start: addDays(today, -1), completed: 1, missed: 1 },
        { start: today, completed: 0, missed: 0 },
        { start: addDays(today, 1), completed: 0, missed: 0 },
      ],
    });
  });

  it("goes week by week for a month, starting each week on Monday", async () => {
    const owner = await ownerWithCompany();
    const found = await dashboard(owner);
    expect(found.period.kind).toBe("this_month");
    expect(found.overTime?.bucket).toBe("week");
    const starts = found.overTime?.points.map((point) => point.start) ?? [];
    expect(starts.length).toBeGreaterThanOrEqual(4);
    for (const start of starts)
      expect(new Date(`${start}T00:00:00Z`).getUTCDay()).toBe(1);
    expect((starts[0] ?? "") <= found.period.from).toBe(true);
    expect(found.overTime?.points.every((point) => point.completed === 0)).toBe(
      true,
    );
  });

  it("counts open Follow-ups due today and overdue, and lists today's the member owns", async () => {
    const owner = await ownerWithCompany();
    const ravi = await memberWith(owner, MARKETING);
    const priya = await memberWith(owner, MARKETING);
    const today = await companyToday(prisma, owner.workspaceId);
    const company = await aCompany(ravi);
    const mine = await aFollowUp(ravi, company, today);
    // Ravi made it for Priya: his own entry, but not his to do today.
    await aFollowUp(ravi, company, today, { ownerMemberId: priya.memberId });
    await aFollowUp(ravi, company, addDays(today, -3));
    await aFollowUp(ravi, company, addDays(today, 1));
    const closed = await aFollowUp(ravi, company, addDays(today, -1));
    const done = await markDone(
      jsonRequest(`${BASE}/follow-ups/${closed.id}/done`, ravi.cookie, {
        expectedUpdatedAt: closed.updatedAt,
      }),
      params(closed.id),
    );
    expect(done.status).toBe(StatusCodes.OK);

    // Not bound to the period: last month shows today's figures too.
    const found = await dashboard(ravi, { period: "last_month" });
    expect(found.totals).toMatchObject({
      followUpsDueToday: 2,
      followUpsOverdue: 1,
    });
    expect(found.today.followUps?.map((row) => row.id)).toEqual([mine.id]);
    expect((await dashboard(priya)).totals).toMatchObject({
      followUpsDueToday: 1,
      followUpsOverdue: 0,
    });
  });

  it("lists the member's own Visits dated today with their shown status", async () => {
    const owner = await ownerWithCompany();
    const ravi = await memberWith(owner, MARKETING);
    const priya = await memberWith(owner, MARKETING);
    const company = await aCompany(ravi);
    const mine = await planVisit(ravi, company, {
      visitAt: (await noon(owner.workspaceId)).toISOString(),
    });
    const cancelled = await planVisit(ravi, company, {
      visitAt: (await noon(owner.workspaceId)).toISOString(),
    });
    await prisma.constructionMarketingVisit.update({
      where: { id: cancelled.id },
      data: { status: "cancelled", cancelReason: "Closed" },
    });
    await planVisit(priya, await aCompany(priya), {
      visitAt: (await noon(owner.workspaceId)).toISOString(),
    });

    const found = await dashboard(ravi);
    expect(found.today.visits?.map((visit) => visit.id)).toEqual([mine.id]);
    expect(found.today.visits?.[0]).toMatchObject({
      checkedIn: false,
      company: { id: company.id },
    });
    // Noon has passed or not; either way it is planned or missed, never cancelled.
    expect(["planned", "missed"]).toContain(found.today.visits?.[0]?.status);
    // Today's list is the viewer's own even with the team's figures.
    expect((await dashboard(owner)).today.visits).toEqual([]);
  });

  it("counts companies won and lost in the period from their Stage changes", async () => {
    const owner = await ownerWithCompany();
    const won = await aCompany(owner);
    const lost = await aCompany(owner);
    const earlier = await aCompany(owner);
    await stage(owner, won, { stage: "won" });
    const once = await stage(owner, lost, {
      stage: "lost",
      lostReason: "price",
    });
    // Lost again for another reason: still one company lost.
    await stage(owner, once, { stage: "lost", lostReason: "competitor" });
    // Won some months ago: Won now, but not in this week.
    await stage(owner, earlier, { stage: "won" });
    await prisma.constructionMarketingStageChange.updateMany({
      where: { prospectCompanyId: earlier.id, toStage: "won" },
      data: { changedAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
    });
    await aCompany(owner);

    const found = await dashboard(owner, { period: "this_week" });
    expect(found.totals.companiesWon).toBe(1);
    expect(found.stages).toMatchObject({ wonInPeriod: 1, lostInPeriod: 1 });
    expect(found.stages?.counts.map((row) => row.stage)).toEqual([
      "new",
      "contacted",
      "requirement_received",
      "quotation_sent",
      "negotiation",
      "won",
      "lost",
    ]);
    expect(stageCount(found, "new")).toBe(1);
    expect(stageCount(found, "won")).toBe(2);
    expect(stageCount(found, "lost")).toBe(1);
    expect(stageCount(found, "negotiation")).toBe(0);
  });

  it("shows recent activity newest first, each kind with its line", async () => {
    const owner = await ownerWithCompany();
    const ravi = await memberWith(owner, MARKETING);
    const company = await aCompany(ravi);
    const visit = await logVisit(
      ravi,
      company,
      await noon(owner.workspaceId, -1),
    );
    const noted = await addNote(
      jsonRequest(`${BASE}/visits/${visit.id}/notes`, ravi.cookie, {
        text: "Called back; they want the drawing first.",
      }),
      params(visit.id),
    );
    expect(noted.ok).toBe(true);
    await stage(ravi, await latestCompany(company.id), {
      stage: "quotation_sent",
    });
    const today = await companyToday(prisma, owner.workspaceId);
    const followUp = await aFollowUp(ravi, company, today);
    await markDone(
      jsonRequest(`${BASE}/follow-ups/${followUp.id}/done`, ravi.cookie, {
        expectedUpdatedAt: followUp.updatedAt,
      }),
      params(followUp.id),
    );

    const found = await dashboard(ravi);
    const recent = found.recent ?? [];
    expect(recent.map((row) => [row.kind, row.text])).toEqual([
      ["follow_up_done", "Call done"],
      ["stage_change", "Contacted → Quotation sent"],
      ["note", "Called back; they want the drawing first."],
      // Completing the Visit moved the company from New in the same instant.
      ["stage_change", "New → Contacted"],
      ["visit_completed", `Completed ${visit.number}`],
    ]);
    expect(recent[0]).toMatchObject({
      by: { id: ravi.userId },
      company: { id: company.id, name: company.name },
    });
    expect(recent[2]?.visit).toEqual({ id: visit.id, number: visit.number });
    const times = recent.map((row) => row.at);
    expect([...times].sort().reverse()).toEqual(times);

    // A colleague without View all sees none of it.
    const priya = await memberWith(owner, MARKETING);
    expect((await dashboard(priya)).recent).toEqual([]);
  });

  it("lists Hot companies with no open Follow-up, until one is added", async () => {
    const owner = await ownerWithCompany();
    const ravi = await memberWith(owner, MARKETING);
    const yesterday = await noon(owner.workspaceId, -1);
    const hot = await aCompany(ravi);
    const cooled = await aCompany(ravi);
    await logVisit(ravi, hot, yesterday, { interest: "hot" });
    await logVisit(ravi, cooled, new Date(yesterday.getTime() - 3_600_000), {
      interest: "hot",
    });
    // Its latest Visit was Warm: no longer Hot.
    await logVisit(ravi, cooled, yesterday, { interest: "warm" });

    const found = await dashboard(ravi);
    expect(found.hotWithoutFollowUp).toEqual([
      {
        id: hot.id,
        name: hot.name,
        lastVisitAt: yesterday.toISOString(),
        assignedTo: { id: ravi.memberId, name: "Member" },
      },
    ]);

    const today = await companyToday(prisma, owner.workspaceId);
    // Anyone's open Follow-up takes it off the list.
    await aFollowUp(owner, hot, today);
    expect((await dashboard(ravi)).hotWithoutFollowUp).toEqual([]);
  });

  it("refuses without Dashboard read, and a bad period or person", async () => {
    const owner = await ownerWithCompany();
    const ravi = await memberWith(owner, MARKETING);
    const noDashboard = await memberWith(owner, {
      "marketing.visits": ["create", "read"],
    });
    const clerk = await memberWith(owner, { "marketing.companies": ["read"] });
    const response = await getDashboard(
      jsonRequest(`${BASE}/dashboard`, noDashboard.cookie),
    );
    expect(response.status).toBe(StatusCodes.FORBIDDEN);

    const today = await companyToday(prisma, owner.workspaceId);
    const bad = {
      status: StatusCodes.BAD_REQUEST,
      code: "DASHBOARD_PERIOD_INVALID",
    };
    expect(await refused(owner, { period: "custom" })).toEqual(bad);
    expect(
      await refused(owner, {
        period: "custom",
        from: today,
        to: addDays(today, -1),
      }),
    ).toEqual(bad);
    expect(
      await refused(owner, {
        period: "custom",
        from: addDays(today, -366),
        to: today,
      }),
    ).toEqual(bad);
    expect((await refused(owner, { period: "next_year" })).status).toBe(
      StatusCodes.BAD_REQUEST,
    );
    // A year, leap day or not, is fine.
    await dashboard(owner, {
      period: "custom",
      from: addDays(today, -365),
      to: today,
    });

    expect(await refused(ravi, { memberId: ravi.memberId })).toEqual({
      status: StatusCodes.BAD_REQUEST,
      code: "DASHBOARD_PERSON_NOT_ALLOWED",
    });
    const notFound = {
      status: StatusCodes.BAD_REQUEST,
      code: "MARKETING_PERSON_NOT_FOUND",
    };
    expect(await refused(owner, { memberId: randomUUID() })).toEqual(notFound);
    // A Team Member whose Role cannot add Visits is not a Marketing Person.
    expect(await refused(owner, { memberId: clerk.memberId })).toEqual(
      notFound,
    );
    // Someone who is no longer active keeps their figures.
    await prisma.constructionOrganizationTeamMember.update({
      where: { id: ravi.memberId },
      data: { status: "left" },
    });
    const person = await dashboard(owner, { memberId: ravi.memberId });
    expect(person.scope).toBe("person");
    expect(person.people?.find((row) => row.id === ravi.memberId)?.active).toBe(
      false,
    );
  });

  it("never shows another Company's records", async () => {
    const owner = await ownerWithCompany();
    const other = await ownerWithCompany("Pandian Builders");
    const theirs = await memberWith(other, MARKETING);
    const company = await aCompany(theirs);
    await logVisit(theirs, company, await noon(other.workspaceId, -1), {
      interest: "hot",
    });
    await aFollowUp(
      theirs,
      company,
      await companyToday(prisma, other.workspaceId),
    );
    await stage(theirs, await latestCompany(company.id), { stage: "won" });

    const { query } = await aroundToday(owner.workspaceId);
    const found = await dashboard(owner, query);
    expect(found.totals).toEqual({
      visitsCompleted: 0,
      visitsPlanned: 0,
      visitsMissed: 0,
      followUpsDueToday: 0,
      followUpsOverdue: 0,
      newCompanies: 0,
      companiesWon: 0,
    });
    expect(found.recent).toEqual([]);
    expect(found.hotWithoutFollowUp).toEqual([]);
    expect(found.people?.map((row) => row.id)).not.toContain(theirs.memberId);
    expect(await refused(owner, { memberId: theirs.memberId })).toEqual({
      status: StatusCodes.BAD_REQUEST,
      code: "MARKETING_PERSON_NOT_FOUND",
    });
  });
});
