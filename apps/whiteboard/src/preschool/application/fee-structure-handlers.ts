import { conflict, forbidden, notFound } from "../domain/errors";
import { assertStructureLines } from "../domain/fee-structure";
import {
  assertCentre,
  assertRole,
  MANAGER_ROLES,
  type PreschoolActor,
} from "./access";
import type {
  FeeStructureKey,
  FeeStructureLine,
  FeeStructureStore,
} from "./fee-ports";
import type { FeeStructureListView, FeeStructureView } from "./fee-views";

/**
 * Fee Structures: the Workspace default per Programme and Academic Year, and
 * a Centre's own amounts when it may override them. The Owner sets the
 * defaults; a Centre Head may set their Centre's amounts only when the
 * Centre's `mayOverrideFees` is on.
 */
export class FeeStructureHandlers {
  constructor(private readonly deps: { store: FeeStructureStore }) {}

  async list(
    actor: PreschoolActor,
    query: { academicYearId?: string; centreId?: string },
  ): Promise<FeeStructureListView> {
    assertRole(actor, MANAGER_ROLES);
    const { store } = this.deps;
    const centreId = query.centreId ?? null;
    let mayOverride: boolean | null = null;
    if (centreId != null) {
      assertCentre(actor, centreId);
      mayOverride = (await this.centre(actor.workspaceId, centreId))
        .mayOverrideFees;
    }
    const academicYear = await this.year(
      actor.workspaceId,
      query.academicYearId,
    );
    const [programmes, structures] = await Promise.all([
      store.programmes(actor.workspaceId),
      store.structures(actor.workspaceId, academicYear.id, centreId),
    ]);
    const find = (programmeId: string, forCentre: string | null) =>
      structures.find(
        (structure) =>
          structure.programmeId === programmeId &&
          structure.centreId === forCentre,
      ) ?? null;
    return {
      academicYear,
      centreId,
      mayOverride,
      items: programmes.map((programme) => {
        const fallback = find(programme.id, null);
        const override = centreId == null ? null : find(programme.id, centreId);
        return {
          programmeId: programme.id,
          programmeName: programme.name,
          default: fallback,
          override,
          effective: override ?? fallback,
        };
      }),
    };
  }

  async save(
    actor: PreschoolActor,
    input: FeeStructureKey & { items: readonly FeeStructureLine[] },
  ): Promise<FeeStructureView> {
    const { store } = this.deps;
    await this.assertMaySet(actor, input.centreId);
    const [year, programme] = await Promise.all([
      store.academicYear(actor.workspaceId, input.academicYearId),
      store.programme(actor.workspaceId, input.programmeId),
    ]);
    if (year == null)
      throw notFound("ACADEMIC_YEAR_NOT_FOUND", "Academic Year not found.");
    if (programme == null)
      throw notFound("PROGRAMME_NOT_FOUND", "Programme not found.");
    if (programme.isArchived)
      throw conflict("PROGRAMME_ARCHIVED", `${programme.name} is archived.`);

    const key: FeeStructureKey = {
      academicYearId: input.academicYearId,
      programmeId: input.programmeId,
      centreId: input.centreId,
    };
    const [heads, existing] = await Promise.all([
      store.feeHeads(
        actor.workspaceId,
        input.items.map((item) => item.feeHeadId),
      ),
      store.find(actor.workspaceId, key),
    ]);
    const kept = new Set(existing?.items.map((item) => item.feeHeadId) ?? []);
    const lines = input.items.map((item) => {
      const head = heads.find((candidate) => candidate.id === item.feeHeadId);
      if (head == null)
        throw notFound("FEE_HEAD_NOT_FOUND", "Fee Head not found.");
      // A line already on the structure may stay after its head is archived.
      if (head.isArchived && !kept.has(head.id))
        throw conflict("FEE_HEAD_ARCHIVED", `${head.name} is archived.`);
      return { ...item, feeHeadName: head.name, kind: head.kind };
    });
    assertStructureLines(lines);
    return store.save(actor.workspaceId, key, input.items);
  }

  /** Removes a Centre's own amounts; its Programme falls back to the default. */
  async remove(actor: PreschoolActor, id: string): Promise<void> {
    const structure = await this.deps.store.findById(actor.workspaceId, id);
    if (structure == null)
      throw notFound("FEE_STRUCTURE_NOT_FOUND", "Fee Structure not found.");
    if (structure.centreId == null)
      throw conflict(
        "FEE_STRUCTURE_DEFAULT",
        "The Workspace default cannot be removed; change its amounts instead.",
      );
    await this.assertMaySet(actor, structure.centreId);
    await this.deps.store.remove(actor.workspaceId, id);
  }

  private async assertMaySet(
    actor: PreschoolActor,
    centreId: string | null,
  ): Promise<void> {
    if (centreId == null) {
      assertRole(actor, ["owner"], "Only the Owner sets the Workspace's fees.");
      return;
    }
    assertRole(actor, MANAGER_ROLES);
    assertCentre(actor, centreId);
    const centre = await this.centre(actor.workspaceId, centreId);
    if (actor.role !== "owner" && !centre.mayOverrideFees)
      throw forbidden(
        "FEE_OVERRIDE_NOT_ALLOWED",
        "This Centre uses Head Office fees and cannot change them.",
      );
  }

  private async centre(
    workspaceId: string,
    id: string,
  ): Promise<{ id: string; mayOverrideFees: boolean }> {
    const centre = await this.deps.store.centre(workspaceId, id);
    if (centre == null) throw notFound("CENTRE_NOT_FOUND", "Centre not found.");
    return centre;
  }

  private async year(
    workspaceId: string,
    id: string | undefined,
  ): Promise<{ id: string; name: string }> {
    const year = await this.deps.store.academicYear(workspaceId, id);
    if (year == null)
      throw notFound("ACADEMIC_YEAR_NOT_FOUND", "Academic Year not found.");
    return year;
  }
}
