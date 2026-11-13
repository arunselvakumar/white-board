import { mockApi } from "@/.storybook/mocks/api";
import {
  BALAJI_ID,
  BALAJI_VISIT_ID,
  KAVERI_ID,
  MANI_MEMBER_ID,
  OWNER_MEMBER_ID,
  PRIYA_MEMBER_ID,
  RAVI_MEMBER_ID,
  STEEL_ID,
  TEXTILES_ID,
} from "@/app/app/marketing/companies/_components/company-fixtures";
import {
  MARKETING_DASHBOARD_API,
  type MarketingDashboard,
} from "@/src/queries/marketing-dashboard";

export { MARKETING_DASHBOARD_API };

const BALAJI = { id: BALAJI_ID, name: "Sri Balaji Infra Projects" };
const TEXTILES = { id: TEXTILES_ID, name: "Coimbatore Textiles Ltd" };
const KAVERI = { id: KAVERI_ID, name: "Kaveri Cement Works" };
const STEEL = { id: STEEL_ID, name: "Madurai Steel Structures" };
const RAVI = { id: RAVI_MEMBER_ID, name: "Ravi Shankar" };
const PRIYA = { id: PRIYA_MEMBER_ID, name: "Priya Raman" };

export const TODAY_VISIT_ID = "0199d000-0000-7000-8000-000000000d01";
export const CHECKED_IN_VISIT_ID = "0199d000-0000-7000-8000-000000000d02";

const NOVEMBER_WEEKS = [
  "2026-10-26",
  "2026-11-02",
  "2026-11-09",
  "2026-11-16",
  "2026-11-23",
  "2026-11-30",
];

/**
 * November 2026, Friday 13th, as the Owner sees the team: the figures,
 * today's own Visits and Follow-ups, people with targets, Mani inactive,
 * and every section present.
 */
export function teamDashboard(
  overrides: Partial<MarketingDashboard> = {},
): MarketingDashboard {
  return {
    period: { kind: "this_month", from: "2026-11-01", to: "2026-11-30" },
    scope: "team",
    canViewTeam: true,
    people: [
      { id: OWNER_MEMBER_ID, name: "Arun Selva Kumar", active: true },
      { ...PRIYA, active: true },
      { ...RAVI, active: true },
      { id: MANI_MEMBER_ID, name: "Mani Kandan", active: false },
    ],
    totals: {
      visitsCompleted: 37,
      visitsPlanned: 12,
      visitsMissed: 3,
      followUpsDueToday: 4,
      followUpsOverdue: 2,
      newCompanies: 6,
      companiesWon: 1,
    },
    today: {
      visits: [
        {
          id: CHECKED_IN_VISIT_ID,
          number: "MV-0041",
          visitAt: "2026-11-13T04:30:00.000Z",
          status: "planned",
          checkedIn: true,
          company: BALAJI,
        },
        {
          id: TODAY_VISIT_ID,
          number: "MV-0042",
          visitAt: "2026-11-13T09:00:00.000Z",
          status: "planned",
          checkedIn: false,
          company: KAVERI,
        },
      ],
      followUps: [
        {
          id: "0199d000-0000-7000-8000-000000000d11",
          type: "call",
          dueDate: "2026-11-13",
          company: TEXTILES,
        },
      ],
    },
    perPerson: [
      {
        memberId: OWNER_MEMBER_ID,
        name: "Arun Selva Kumar",
        active: true,
        completed: 3,
        target: null,
      },
      {
        memberId: PRIYA.id,
        name: PRIYA.name,
        active: true,
        completed: 22,
        target: 20,
      },
      {
        memberId: RAVI.id,
        name: RAVI.name,
        active: true,
        completed: 12,
        target: 20,
      },
      {
        memberId: MANI_MEMBER_ID,
        name: "Mani Kandan",
        active: false,
        completed: 0,
        target: 15,
      },
    ],
    stages: {
      counts: [
        { stage: "new", count: 9 },
        { stage: "contacted", count: 14 },
        { stage: "requirement_received", count: 6 },
        { stage: "quotation_sent", count: 4 },
        { stage: "negotiation", count: 2 },
        { stage: "won", count: 3 },
        { stage: "lost", count: 5 },
      ],
      wonInPeriod: 1,
      lostInPeriod: 2,
    },
    overTime: {
      bucket: "week",
      points: NOVEMBER_WEEKS.map((start, index) => ({
        start,
        completed: [2, 9, 11, 8, 7, 0][index] ?? 0,
        missed: [0, 1, 2, 0, 0, 0][index] ?? 0,
      })),
    },
    recent: [
      {
        kind: "visit_completed",
        at: "2026-11-13T05:10:00.000Z",
        by: { id: "user-ravi", name: "Ravi Shankar" },
        company: BALAJI,
        visit: { id: BALAJI_VISIT_ID, number: "MV-0040" },
        text: "Completed MV-0040",
      },
      {
        kind: "stage_change",
        at: "2026-11-12T11:00:00.000Z",
        by: { id: "user-priya", name: "Priya Raman" },
        company: STEEL,
        visit: null,
        text: "Requirement received → Quotation sent",
      },
      {
        kind: "note",
        at: "2026-11-12T08:15:00.000Z",
        by: { id: "user-ravi", name: "Ravi Shankar" },
        company: KAVERI,
        visit: { id: TODAY_VISIT_ID, number: "MV-0042" },
        text: "Wants a PEB shed of 12,000 sq ft before March.",
      },
      {
        kind: "follow_up_done",
        at: "2026-11-11T06:00:00.000Z",
        by: null,
        company: TEXTILES,
        visit: null,
        text: "Call done",
      },
    ],
    hotWithoutFollowUp: [
      {
        ...STEEL,
        // 12 Nov in India, still 11 Nov in UTC.
        lastVisitAt: "2026-11-11T19:30:00.000Z",
        assignedTo: PRIYA,
      },
    ],
    ...overrides,
  };
}

/** A member on the Marketing Role: their own figures, no people, no table. */
export function ownDashboard(
  overrides: Partial<MarketingDashboard> = {},
): MarketingDashboard {
  return teamDashboard({
    scope: "own",
    canViewTeam: false,
    people: null,
    perPerson: null,
    totals: {
      visitsCompleted: 12,
      visitsPlanned: 4,
      visitsMissed: 0,
      followUpsDueToday: 1,
      followUpsOverdue: 0,
      newCompanies: 2,
      companiesWon: 0,
    },
    ...overrides,
  });
}

/** Ravi's figures, chosen by the Owner. */
export function raviDashboard(): MarketingDashboard {
  return teamDashboard({
    scope: "person",
    totals: {
      visitsCompleted: 12,
      visitsPlanned: 5,
      visitsMissed: 2,
      followUpsDueToday: 2,
      followUpsOverdue: 1,
      newCompanies: 3,
      companiesWon: 0,
    },
  });
}

/** October with nothing done: zeros, an empty chart, no activity. */
export function emptyDashboard(
  overrides: Partial<MarketingDashboard> = {},
): MarketingDashboard {
  const base = teamDashboard();
  return teamDashboard({
    period: { kind: "last_month", from: "2026-10-01", to: "2026-10-31" },
    totals: {
      visitsCompleted: 0,
      visitsPlanned: 0,
      visitsMissed: 0,
      followUpsDueToday: 0,
      followUpsOverdue: 0,
      newCompanies: 0,
      companiesWon: 0,
    },
    today: { visits: [], followUps: [] },
    perPerson: (base.perPerson ?? []).map((person) => ({
      ...person,
      completed: 0,
    })),
    stages: {
      counts: (base.stages?.counts ?? []).map((row) => ({ ...row, count: 0 })),
      wonInPeriod: 0,
      lostInPeriod: 0,
    },
    overTime: {
      bucket: "week",
      points: [
        "2026-09-28",
        "2026-10-05",
        "2026-10-12",
        "2026-10-19",
        "2026-10-26",
      ].map((start) => ({ start, completed: 0, missed: 0 })),
    },
    recent: [],
    hotWithoutFollowUp: [],
    ...overrides,
  });
}

/** This week, day by day. */
export function weekDashboard(): MarketingDashboard {
  return teamDashboard({
    period: { kind: "this_week", from: "2026-11-09", to: "2026-11-15" },
    overTime: {
      bucket: "day",
      points: [9, 10, 11, 12, 13, 14, 15].map((day, index) => ({
        start: `2026-11-${String(day)}`,
        completed: [2, 3, 1, 4, 1, 0, 0][index] ?? 0,
        missed: [0, 1, 0, 0, 0, 0, 0][index] ?? 0,
      })),
    },
  });
}

/** A Role that reads Visits and Companies but not Follow-ups. */
export function noFollowUpsDashboard(): MarketingDashboard {
  return ownDashboard({
    totals: {
      ...ownDashboard().totals,
      followUpsDueToday: null,
      followUpsOverdue: null,
    },
    today: { ...teamDashboard().today, followUps: null },
    hotWithoutFollowUp: null,
  });
}

/**
 * Answers the Dashboard read: by default the team this month, last month
 * empty, this week by day and Ravi when he is chosen.
 */
export function mockDashboardApi(
  answer: (params: URLSearchParams) => MarketingDashboard = teamAnswer,
) {
  return mockApi((call) => {
    const url = new URL(call.path, "http://storybook.local");
    if (call.method === "GET" && url.pathname === MARKETING_DASHBOARD_API)
      return Response.json(answer(url.searchParams));
    return undefined;
  });
}

export function teamAnswer(params: URLSearchParams): MarketingDashboard {
  if (params.get("memberId") === RAVI_MEMBER_ID) return raviDashboard();
  switch (params.get("period")) {
    case "last_month":
      return emptyDashboard();
    case "this_week":
      return weekDashboard();
    case "custom":
      return teamDashboard({
        period: {
          kind: "custom",
          from: params.get("from") ?? "",
          to: params.get("to") ?? "",
        },
      });
    default:
      return teamDashboard();
  }
}
