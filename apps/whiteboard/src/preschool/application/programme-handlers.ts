import { conflict, notFound } from "../domain/errors";
import {
  programmeFields,
  reorderProgrammes,
  type ProgrammeFields,
} from "../domain/programme";
import { assertRole, type PreschoolActor } from "./access";
import type { ProgrammeStore } from "./programme-ports";
import type { ProgrammeListView, ProgrammeView } from "./programme-views";

/** Programmes belong to the Workspace; only the Owner changes them. */
export class ProgrammeHandlers {
  constructor(
    private readonly deps: { store: ProgrammeStore; now: () => Date },
  ) {}

  async list(
    actor: PreschoolActor,
    query: { includeArchived: boolean },
  ): Promise<ProgrammeListView> {
    return {
      items: await this.deps.store.list(
        actor.workspaceId,
        query.includeArchived,
      ),
    };
  }

  async create(
    actor: PreschoolActor,
    input: ProgrammeFields,
  ): Promise<ProgrammeView> {
    assertRole(actor, ["owner"]);
    const fields = programmeFields(input);
    await this.assertNameFree(actor.workspaceId, fields.name);
    return this.deps.store.create(actor.workspaceId, fields);
  }

  async updateDetails(
    actor: PreschoolActor,
    id: string,
    input: ProgrammeFields,
  ): Promise<ProgrammeView> {
    assertRole(actor, ["owner"]);
    const programme = await this.get(actor.workspaceId, id);
    const fields = programmeFields(input);
    if (!programme.isArchived)
      await this.assertNameFree(actor.workspaceId, fields.name, id);
    return this.deps.store.update(actor.workspaceId, id, fields);
  }

  async archive(actor: PreschoolActor, id: string): Promise<ProgrammeView> {
    assertRole(actor, ["owner"]);
    const programme = await this.get(actor.workspaceId, id);
    if (programme.isArchived) return programme;
    const classrooms = await this.deps.store.currentClassroomCount(
      actor.workspaceId,
      id,
    );
    if (classrooms > 0)
      throw conflict(
        "PROGRAMME_HAS_CLASSROOMS",
        `${programme.name} has ${classrooms} ${classrooms === 1 ? "Classroom" : "Classrooms"} this Academic Year. Archive them first.`,
        { classroomCount: classrooms },
      );
    return this.deps.store.setArchivedAt(
      actor.workspaceId,
      id,
      this.deps.now(),
    );
  }

  async restore(actor: PreschoolActor, id: string): Promise<ProgrammeView> {
    assertRole(actor, ["owner"]);
    const programme = await this.get(actor.workspaceId, id);
    if (!programme.isArchived) return programme;
    await this.assertNameFree(actor.workspaceId, programme.name, id);
    return this.deps.store.setArchivedAt(actor.workspaceId, id, null);
  }

  async reorder(
    actor: PreschoolActor,
    orderedIds: readonly string[],
  ): Promise<ProgrammeListView> {
    assertRole(actor, ["owner"]);
    const current = await this.deps.store.list(actor.workspaceId, true);
    const ids = reorderProgrammes(
      current.map((programme) => ({
        id: programme.id,
        archived: programme.isArchived,
      })),
      orderedIds,
    );
    await this.deps.store.setOrder(actor.workspaceId, ids);
    return this.list(actor, { includeArchived: false });
  }

  private async get(workspaceId: string, id: string): Promise<ProgrammeView> {
    const programme = await this.deps.store.find(workspaceId, id);
    if (programme == null)
      throw notFound("PROGRAMME_NOT_FOUND", "Programme not found.");
    return programme;
  }

  private async assertNameFree(
    workspaceId: string,
    name: string,
    exceptId?: string,
  ): Promise<void> {
    if (await this.deps.store.nameTaken(workspaceId, name, exceptId))
      throw conflict(
        "PROGRAMME_NAME_IN_USE",
        `There is already a Programme called ${name}.`,
      );
  }
}
