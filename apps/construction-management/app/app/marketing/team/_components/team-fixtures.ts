import { mockApi, type ApiCall } from "@/.storybook/mocks/api";
import {
  MANI_MEMBER_ID,
  OWNER_MEMBER_ID,
  PRIYA_MEMBER_ID,
  RAVI_MEMBER_ID,
} from "@/app/app/marketing/companies/_components/company-fixtures";
import {
  MARKETING_TEAM_API,
  type MarketingTeam,
  type MarketingTeamPerson,
} from "@/src/queries/marketing-team";

export { MARKETING_TEAM_API };

/** The Marketing Role Add Marketing Person picks on Add Staff. */
export const MARKETING_ROLE_ID = "0199d000-0000-7000-8000-000000000701";

export function teamPerson(
  overrides: Partial<MarketingTeamPerson> = {},
): MarketingTeamPerson {
  return {
    memberId: RAVI_MEMBER_ID,
    name: "Ravi Shankar",
    mobile: "+919840000002",
    isOwner: false,
    active: true,
    visitsThisMonth: 12,
    target: 20,
    followUpsOverdue: 2,
    lastVisitAt: "2026-11-11T09:30:00.000Z",
    ...overrides,
  };
}

/**
 * November 2026: the Owner without a target, Priya past hers with nothing
 * overdue, Ravi short with two overdue, and Mani, who left.
 */
export function team(overrides: Partial<MarketingTeam> = {}): MarketingTeam {
  return {
    month: "2026-11",
    people: [
      teamPerson({
        memberId: OWNER_MEMBER_ID,
        name: "Arun Selva Kumar",
        mobile: "+919840000001",
        isOwner: true,
        visitsThisMonth: 3,
        target: null,
        followUpsOverdue: 0,
        lastVisitAt: "2026-11-05T05:00:00.000Z",
      }),
      teamPerson({
        memberId: PRIYA_MEMBER_ID,
        name: "Priya Raman",
        mobile: "+919840000003",
        visitsThisMonth: 22,
        target: 20,
        followUpsOverdue: 0,
        // 13 Nov in India, still 12 Nov in UTC.
        lastVisitAt: "2026-11-12T19:00:00.000Z",
      }),
      teamPerson(),
      teamPerson({
        memberId: MANI_MEMBER_ID,
        name: "Mani Kandan",
        mobile: null,
        active: false,
        visitsThisMonth: 0,
        target: 15,
        followUpsOverdue: 1,
        lastVisitAt: null,
      }),
    ],
    canSetTargets: true,
    addPersonRoleId: MARKETING_ROLE_ID,
    canAddPerson: true,
    ...overrides,
  };
}

export type TeamApiOptions = {
  team?: MarketingTeam;
  /** Answers before the defaults (an error a story wants). */
  extra?: (call: ApiCall) => Response | undefined;
};

const json = (body: unknown, status = 200) => Response.json(body, { status });

/** Answers the Team read and target changes for one story. */
export function mockTeamApi(options: TeamApiOptions = {}) {
  let current = options.team ?? team();
  return mockApi((call) => {
    const extra = options.extra?.(call);
    if (extra != null) return extra;
    if (call.method === "GET" && call.path === MARKETING_TEAM_API)
      return json(current);
    const match =
      /^\/api\/construction\/marketing\/team\/([^/]+)\/target$/.exec(call.path);
    if (call.method === "POST" && match != null) {
      const target = (call.body as { target: number | null }).target;
      current = {
        ...current,
        people: current.people.map((person) =>
          person.memberId === match[1] ? { ...person, target } : person,
        ),
      };
      return json(current);
    }
    return undefined;
  });
}
