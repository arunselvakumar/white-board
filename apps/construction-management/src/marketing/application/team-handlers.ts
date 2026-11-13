import { assertCan, can, type MemberAccess } from "@/src/shared-kernel/access";
import { recordAudit } from "@/src/shared-kernel/audit";
import type { CalendarDate } from "@/src/shared-kernel/calendar-date";

import { marketingPersonNotFound } from "../domain/marketing-errors";
import type { FollowUpType, Stage } from "../domain/marketing-terms";
import { monthBounds, monthOf, targetFor, visitTarget } from "../domain/team";
import type { MarketingDb, MarketingTeam, TeamStore } from "./ports";

export const TEAM_MENU = "marketing.team";
const COMPANIES_MENU = "marketing.companies";

export type TeamDeps = {
  db: MarketingDb;
  store: TeamStore;
  team: MarketingTeam;
  today: (workspaceId: string) => Promise<CalendarDate>;
  timeZone: (workspaceId: string) => Promise<string>;
  /** Midnight starting a day in the Company time zone. */
  dayStart: (date: CalendarDate, timeZone: string) => Date;
  /**
   * The Company's default Marketing Role, for Add Marketing Person; null
   * where the Company has its own Role of that name (ADR CM-0040 §3).
   */
  marketingRoleId: (workspaceId: string) => Promise<string | null>;
  clock?: () => Date;
};

export type TeamRow = {
  memberId: string;
  name: string;
  mobile: string | null;
  isOwner: boolean;
  active: boolean;
  /** Completed Visits they went on this month. */
  visitsThisMonth: number;
  /** This month's target; null for none. */
  target: number | null;
  followUpsOverdue: number;
  lastVisitAt: Date | null;
};

export type TeamReadModel = {
  /** `YYYY-MM`, the Company's current month. */
  month: string;
  people: TeamRow[];
  canSetTargets: boolean;
  /** Add Staff with this Role preselected; null without one or the right. */
  addPersonRoleId: string | null;
  canAddPerson: boolean;
};

export type NeedsReassigning = {
  companies: {
    id: string;
    name: string;
    city: string | null;
    stage: Stage;
    assignedTo: { id: string; name: string };
    updatedAt: Date;
  }[];
  followUps: {
    id: string;
    type: FollowUpType;
    dueDate: CalendarDate;
    owner: { id: string; name: string };
    prospectCompany: { id: string; name: string };
    updatedAt: Date;
  }[];
};

/**
 * Marketing → Team (PRD §3.2, ADR CM-0040 §4): every Marketing Person with
 * this month's Visits against target, Follow-ups overdue and their last
 * Visit, for anyone with Team read; targets with Team update; and what
 * needs reassigning, for anyone with Companies transfer.
 */
export class TeamHandlers {
  private readonly clock: () => Date;

  constructor(private readonly deps: TeamDeps) {
    this.clock = deps.clock ?? (() => new Date());
  }

  async team(access: MemberAccess): Promise<TeamReadModel> {
    assertCan(access, TEAM_MENU, "read");
    const ws = access.workspaceId;
    const [people, today, timeZone, roleId] = await Promise.all([
      this.deps.team.people(ws),
      this.deps.today(ws),
      this.deps.timeZone(ws),
      this.deps.marketingRoleId(ws),
    ]);
    const month = monthOf(today);
    const { first, next } = monthBounds(month);
    const ids = people.map((person) => person.id);
    const [targets, visits, last, overdue] = await Promise.all([
      this.deps.store.targets(ws, ids),
      this.deps.store.completedVisits(
        ws,
        this.deps.dayStart(first, timeZone),
        this.deps.dayStart(next, timeZone),
      ),
      this.deps.store.lastVisits(ws),
      this.deps.store.overdueFollowUps(ws, today),
    ]);
    const canAddPerson = can(access, "organization.team_members", "create");
    return {
      month,
      people: people.map((person) => ({
        memberId: person.id,
        name: person.name,
        mobile: person.mobile,
        isOwner: person.isOwner,
        active: person.active,
        visitsThisMonth: visits.get(person.id) ?? 0,
        target: targetFor(
          targets.filter((row) => row.memberId === person.id),
          month,
        ),
        followUpsOverdue: overdue.get(person.id) ?? 0,
        lastVisitAt: last.get(person.id) ?? null,
      })),
      canSetTargets: can(access, TEAM_MENU, "update"),
      addPersonRoleId: canAddPerson ? roleId : null,
      canAddPerson,
    };
  }

  /**
   * A person's monthly target from the current month on; earlier months
   * keep the target they had (ADR CM-0040 §4).
   */
  async setTarget(
    access: MemberAccess,
    memberId: string,
    raw: number | null,
  ): Promise<void> {
    assertCan(access, TEAM_MENU, "update");
    const target = visitTarget(raw);
    const ws = access.workspaceId;
    const [people, today] = await Promise.all([
      this.deps.team.people(ws),
      this.deps.today(ws),
    ]);
    if (!people.some((person) => person.id === memberId))
      throw marketingPersonNotFound("memberId");
    const month = monthOf(today);
    const at = this.clock();
    await this.deps.store.setTarget({
      workspaceId: ws,
      memberId,
      month,
      target,
      by: access.userId,
      at,
    });
    await recordAudit(this.deps.db, {
      workspaceId: ws,
      actorUserId: access.userId,
      action: "visit_target.set",
      entityType: "marketing_visit_target",
      entityId: memberId,
      after: { month, target },
      occurredAt: at,
    });
  }

  /**
   * Prospect Companies and open Follow-ups whose person is no longer an
   * active Marketing Person (ADR CM-0040 §4), for Companies transfer.
   */
  async needsReassigning(access: MemberAccess): Promise<NeedsReassigning> {
    assertCan(access, COMPANIES_MENU, "transfer");
    const ws = access.workspaceId;
    const people = await this.deps.team.people(ws);
    const active = people
      .filter((person) => person.active)
      .map((person) => person.id);
    const [companies, followUps] = await Promise.all([
      this.deps.store.companiesOutside(ws, active),
      this.deps.store.followUpsOutside(ws, active),
    ]);
    const names = await this.deps.team.memberNames(ws, [
      ...companies.map((company) => company.assignedMemberId),
      ...followUps.map((followUp) => followUp.ownerMemberId),
    ]);
    const person = (id: string) => ({
      id,
      name: names.get(id) ?? "Removed member",
    });
    return {
      companies: companies.map(({ assignedMemberId, ...company }) => ({
        ...company,
        assignedTo: person(assignedMemberId),
      })),
      followUps: followUps.map(({ ownerMemberId, ...followUp }) => ({
        ...followUp,
        owner: person(ownerMemberId),
      })),
    };
  }
}
