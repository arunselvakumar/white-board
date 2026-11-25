import { nextAcademicYear } from "../domain/academic-year";
import { conflict, notFound } from "../domain/errors";
import { assertRole, type PreschoolActor } from "./access";
import type { AcademicYearStore } from "./academic-year-ports";
import type {
  AcademicYearListView,
  AcademicYearView,
} from "./academic-year-views";

/**
 * Academic Years have no free-form dates: each new year follows the latest
 * one, on the Workspace's start month.
 */
export class AcademicYearHandlers {
  constructor(private readonly deps: { store: AcademicYearStore }) {}

  async list(actor: PreschoolActor): Promise<AcademicYearListView> {
    return { items: await this.deps.store.list(actor.workspaceId) };
  }

  async createNext(actor: PreschoolActor): Promise<AcademicYearView> {
    assertRole(actor, ["owner"]);
    const { store } = this.deps;
    const [years, startMonth] = await Promise.all([
      store.list(actor.workspaceId),
      store.startMonth(actor.workspaceId),
    ]);
    const latest = years[0];
    if (latest == null)
      throw notFound(
        "ACADEMIC_YEAR_NOT_FOUND",
        "This Preschool has no Academic Year yet.",
      );
    const created = await store.create(
      actor.workspaceId,
      nextAcademicYear(latest.startsOn, startMonth),
    );
    if (created == null)
      throw conflict(
        "ACADEMIC_YEAR_EXISTS",
        "That Academic Year was just added. Refresh to see it.",
      );
    return created;
  }

  async makeCurrent(
    actor: PreschoolActor,
    id: string,
  ): Promise<AcademicYearView> {
    assertRole(actor, ["owner"]);
    const year = await this.deps.store.makeCurrent(actor.workspaceId, id);
    if (year == null)
      throw notFound("ACADEMIC_YEAR_NOT_FOUND", "Academic Year not found.");
    return year;
  }
}
