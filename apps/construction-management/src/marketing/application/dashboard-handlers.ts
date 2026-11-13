import { assertCan, can, type MemberAccess } from "@/src/shared-kernel/access";
import { addDays, type CalendarDate } from "@/src/shared-kernel/calendar-date";

import {
  bucketStartOf,
  bucketStarts,
  dashboardBucket,
  dashboardPeriod,
  shortNote,
  targetMonthOf,
  type DashboardBucket,
  type DashboardPeriod,
  type DashboardPeriodKind,
  type DashboardScope,
  type DashboardSections,
} from "../domain/dashboard";
import { invalidField } from "../domain/marketing-errors";
import {
  FOLLOW_UP_TYPE_LABELS,
  STAGES,
  STAGE_LABELS,
  type FollowUpType,
  type Stage,
} from "../domain/marketing-terms";
import { targetFor } from "../domain/team";
import { shownStatus } from "../domain/visit";
import type {
  DashboardActivity,
  DashboardStore,
  MarketingTeam,
  TeamStore,
} from "./ports";

export const DASHBOARD_MENU = "marketing.dashboard";
const VISITS_MENU = "marketing.visits";
const FOLLOW_UPS_MENU = "marketing.follow_ups";
const COMPANIES_MENU = "marketing.companies";

/** Recent activity and Hot companies show this many at most. */
const LIST_LIMIT = 10;

export type DashboardDeps = {
  store: DashboardStore;
  teamStore: Pick<TeamStore, "targets" | "completedVisits">;
  team: MarketingTeam;
  timeZone: (workspaceId: string) => Promise<string>;
  /** The Company time zone's date of an instant. */
  dateIn: (instant: Date, timeZone: string) => CalendarDate;
  /** Midnight starting a day in the Company time zone. */
  dayStart: (date: CalendarDate, timeZone: string) => Date;
  clock?: () => Date;
};

export type DashboardQuery = {
  period: DashboardPeriodKind;
  /** `YYYY-MM-DD`; with `to`, for a custom period. */
  from?: string;
  to?: string;
  /** One Marketing Person's figures; needs View all on the Dashboard. */
  memberId?: string;
};

type Ref = { id: string; name: string };

export type DashboardActivityView = {
  kind: DashboardActivity["kind"];
  at: Date;
  by: Ref | null;
  company: Ref;
  visit: { id: string; number: string } | null;
  text: string;
};

export type DashboardReadModel = {
  period: DashboardPeriod;
  scope: DashboardScope["kind"];
  canViewTeam: boolean;
  people: { id: string; name: string; active: boolean }[] | null;
  totals: {
    visitsCompleted: number | null;
    visitsPlanned: number | null;
    visitsMissed: number | null;
    followUpsDueToday: number | null;
    followUpsOverdue: number | null;
    newCompanies: number | null;
    companiesWon: number | null;
  };
  today: {
    visits:
      | {
          id: string;
          number: string;
          visitAt: Date;
          status: "planned" | "missed" | "completed";
          checkedIn: boolean;
          company: Ref;
        }[]
      | null;
    followUps:
      | {
          id: string;
          type: FollowUpType;
          dueDate: CalendarDate;
          company: Ref;
        }[]
      | null;
  };
  perPerson:
    | {
        memberId: string;
        name: string;
        active: boolean;
        completed: number;
        target: number | null;
      }[]
    | null;
  stages: {
    counts: { stage: Stage; count: number }[];
    wonInPeriod: number;
    lostInPeriod: number;
  } | null;
  overTime: {
    bucket: DashboardBucket;
    points: { start: CalendarDate; completed: number; missed: number }[];
  } | null;
  recent: DashboardActivityView[] | null;
  hotWithoutFollowUp:
    | { id: string; name: string; lastVisitAt: Date; assignedTo: Ref | null }[]
    | null;
};

function personNotAllowed() {
  return invalidField(
    "DASHBOARD_PERSON_NOT_ALLOWED",
    "Only someone who sees the team's figures can choose a Marketing Person.",
    "memberId",
  );
}

function personNotFound() {
  return invalidField(
    "MARKETING_PERSON_NOT_FOUND",
    "Choose a Marketing Person of this Company.",
    "memberId",
  );
}

function activityText(row: DashboardActivity): string {
  switch (row.kind) {
    case "visit_completed":
      return `Completed ${row.visit?.number ?? "a Visit"}`;
    case "note":
      return shortNote(row.note ?? "");
    case "stage_change":
      return row.stage == null
        ? ""
        : `${STAGE_LABELS[row.stage.from]} → ${STAGE_LABELS[row.stage.to]}`;
    case "follow_up_done":
      return `${row.followUpType == null ? "Follow-up" : FOLLOW_UP_TYPE_LABELS[row.followUpType]} done`;
  }
}

/**
 * The Marketing Dashboard (PRD §3.7, ADR CM-0040 §13). Needs Dashboard
 * read. Without View all on the Dashboard every figure is the member's
 * own (§5); with it, the team's or one Marketing Person's. Each section
 * also needs read on its own menu, and is null without it. Nothing is
 * stored: every figure is read over the marketing tables.
 */
export class DashboardHandlers {
  private readonly clock: () => Date;

  constructor(private readonly deps: DashboardDeps) {
    this.clock = deps.clock ?? (() => new Date());
  }

  async read(
    access: MemberAccess,
    query: DashboardQuery,
  ): Promise<DashboardReadModel> {
    assertCan(access, DASHBOARD_MENU, "read");
    const canViewTeam = can(access, DASHBOARD_MENU, "view_all");
    if (query.memberId != null && !canViewTeam) throw personNotAllowed();
    const ws = access.workspaceId;
    const now = this.clock();
    const timeZone = await this.deps.timeZone(ws);
    const today = this.deps.dateIn(now, timeZone);
    const period = dashboardPeriod(
      { kind: query.period, from: query.from, to: query.to },
      today,
    );
    const sections: DashboardSections = {
      visits: can(access, VISITS_MENU, "read"),
      followUps: can(access, FOLLOW_UPS_MENU, "read"),
      companies: can(access, COMPANIES_MENU, "read"),
    };

    const [people, self] = await Promise.all([
      canViewTeam ? this.deps.team.people(ws) : Promise.resolve(null),
      access.memberId != null
        ? Promise.resolve(access.memberId)
        : this.deps.team.memberOfUser(ws, access.userId),
    ]);
    if (
      query.memberId != null &&
      !(people ?? []).some((person) => person.id === query.memberId)
    )
      throw personNotFound();
    const own = { userId: access.userId, memberId: self };
    const scope: DashboardScope =
      query.memberId != null
        ? { kind: "person", memberId: query.memberId }
        : canViewTeam
          ? { kind: "team" }
          : { kind: "own", ...own };

    const at = (date: CalendarDate) => this.deps.dayStart(date, timeZone);
    const from = at(period.from);
    const to = at(addDays(period.to, 1));
    const targetMonth = targetMonthOf(period);
    const readsAny =
      sections.visits || sections.companies || sections.followUps;
    const readsHot =
      sections.visits && sections.companies && sections.followUps;
    const { store } = this.deps;

    const [
      visits,
      followUps,
      companies,
      todayVisits,
      todayFollowUps,
      completedByPerson,
      targets,
      recent,
      hot,
    ] = await Promise.all([
      sections.visits
        ? store.visitsBetween(ws, scope, from, to)
        : Promise.resolve(null),
      sections.followUps
        ? store.openFollowUpsDueBy(ws, scope, today)
        : Promise.resolve(null),
      sections.companies
        ? store.companyFigures(ws, scope, from, to)
        : Promise.resolve(null),
      sections.visits
        ? store.ownVisitsBetween(ws, own, at(today), at(addDays(today, 1)))
        : Promise.resolve(null),
      !sections.followUps
        ? Promise.resolve(null)
        : self == null
          ? Promise.resolve([])
          : store.ownedFollowUpsDue(ws, self, today),
      canViewTeam && sections.visits
        ? this.deps.teamStore.completedVisits(ws, from, to)
        : Promise.resolve(null),
      canViewTeam && sections.visits && targetMonth != null && people != null
        ? this.deps.teamStore.targets(
            ws,
            people.map((person) => person.id),
          )
        : Promise.resolve([]),
      readsAny
        ? store.recentActivity(ws, scope, sections, LIST_LIMIT)
        : Promise.resolve(null),
      readsHot
        ? store.hotWithoutFollowUp(ws, scope, LIST_LIMIT)
        : Promise.resolve(null),
    ]);

    const latest =
      recent
        ?.sort(
          (a, b) =>
            b.at.getTime() - a.at.getTime() || a.kind.localeCompare(b.kind),
        )
        .slice(0, LIST_LIMIT) ?? null;
    const [users, members] = await Promise.all([
      this.deps.team.userNames(
        ws,
        (latest ?? []).flatMap((row) =>
          row.byUserId == null ? [] : [row.byUserId],
        ),
      ),
      this.deps.team.memberNames(
        ws,
        (hot ?? []).flatMap((row) =>
          row.assignedMemberId == null ? [] : [row.assignedMemberId],
        ),
      ),
    ]);

    let visitTotals: {
      completed: number;
      planned: number;
      missed: number;
    } | null = null;
    let overTime: DashboardReadModel["overTime"] = null;
    if (visits != null) {
      const bucket = dashboardBucket(period);
      const points = new Map(
        bucketStarts(period, bucket).map((start) => [
          start,
          { start, completed: 0, missed: 0 },
        ]),
      );
      visitTotals = { completed: 0, planned: 0, missed: 0 };
      for (const visit of visits) {
        const shown = shownStatus(visit, now);
        if (shown === "cancelled") continue;
        visitTotals[shown] += 1;
        if (shown === "planned") continue;
        const point = points.get(
          bucketStartOf(this.deps.dateIn(visit.visitAt, timeZone), bucket),
        );
        if (point != null) point[shown] += 1;
      }
      overTime = { bucket, points: [...points.values()] };
    }

    return {
      period,
      scope: scope.kind,
      canViewTeam,
      people:
        people?.map((person) => ({
          id: person.id,
          name: person.name,
          active: person.active,
        })) ?? null,
      totals: {
        visitsCompleted: visitTotals?.completed ?? null,
        visitsPlanned: visitTotals?.planned ?? null,
        visitsMissed: visitTotals?.missed ?? null,
        followUpsDueToday: followUps?.dueToday ?? null,
        followUpsOverdue: followUps?.overdue ?? null,
        newCompanies: companies?.created ?? null,
        companiesWon: companies?.won ?? null,
      },
      today: {
        visits:
          todayVisits?.flatMap((visit) => {
            const status = shownStatus(visit, now);
            return status === "cancelled" ? [] : [{ ...visit, status }];
          }) ?? null,
        followUps: todayFollowUps,
      },
      perPerson:
        completedByPerson == null || people == null
          ? null
          : people.map((person) => ({
              memberId: person.id,
              name: person.name,
              active: person.active,
              completed: completedByPerson.get(person.id) ?? 0,
              target:
                targetMonth == null
                  ? null
                  : targetFor(
                      targets.filter((row) => row.memberId === person.id),
                      targetMonth,
                    ),
            })),
      stages:
        companies == null
          ? null
          : {
              counts: STAGES.map((stage) => ({
                stage,
                count: companies.byStage.get(stage) ?? 0,
              })),
              wonInPeriod: companies.won,
              lostInPeriod: companies.lost,
            },
      overTime,
      recent:
        latest?.map((row) => ({
          kind: row.kind,
          at: row.at,
          by:
            row.byUserId == null
              ? null
              : {
                  id: row.byUserId,
                  name: users.get(row.byUserId) ?? "Unknown",
                },
          company: row.company,
          visit: row.visit,
          text: activityText(row),
        })) ?? null,
      hotWithoutFollowUp:
        hot?.map((row) => ({
          id: row.id,
          name: row.name,
          lastVisitAt: row.lastVisitAt,
          assignedTo:
            row.assignedMemberId == null
              ? null
              : {
                  id: row.assignedMemberId,
                  name: members.get(row.assignedMemberId) ?? "Removed member",
                },
        })) ?? null,
    };
  }
}
