import { todayInIndia } from "../domain/dates";
import { notFound } from "../domain/errors";
import {
  assertCentre,
  assertManagerOf,
  assertRole,
  MANAGER_ROLES,
  type PreschoolActor,
} from "./access";
import type { FeeReportStore } from "./fee-ports";
import type { DuesListView, FeeSummaryView } from "./fee-views";

/** Dues and collection totals for managers. */
export class FeeReportHandlers {
  constructor(
    private readonly deps: { store: FeeReportStore; now: () => Date },
  ) {}

  /** Children who owe, most overdue first. */
  async dues(
    actor: PreschoolActor,
    query: {
      centreId: string;
      classroomId?: string;
      only: "overdue" | "all";
    },
  ): Promise<DuesListView> {
    assertManagerOf(actor, query.centreId);
    const rows = await this.deps.store.dues(actor.workspaceId, {
      centreId: query.centreId,
      classroomId: query.classroomId ?? null,
      today: todayInIndia(this.deps.now()),
    });
    const items = (
      query.only === "overdue"
        ? rows.filter((row) => row.overduePaise > 0)
        : rows
    ).sort(
      (a, b) =>
        b.overduePaise - a.overduePaise ||
        b.duePaise - a.duePaise ||
        a.firstName.localeCompare(b.firstName) ||
        a.childId.localeCompare(b.childId),
    );
    return { items };
  }

  /** One Centre, or every Centre the actor manages when none is given. */
  async summary(
    actor: PreschoolActor,
    query: { centreId?: string },
  ): Promise<FeeSummaryView> {
    assertRole(actor, MANAGER_ROLES);
    if (query.centreId != null) assertCentre(actor, query.centreId);
    const centreIds =
      query.centreId == null ? actor.centreIds : [query.centreId];
    if (centreIds.length === 0)
      throw notFound("CENTRE_NOT_FOUND", "Centre not found.");
    const today = todayInIndia(this.deps.now());
    return this.deps.store.summary(actor.workspaceId, {
      centreIds,
      today,
      monthStartsOn: `${today.slice(0, 8)}01`,
    });
  }
}
