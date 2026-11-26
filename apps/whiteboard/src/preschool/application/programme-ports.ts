import type { ProgrammeFields } from "../domain/programme";
import type { ProgrammeView } from "./programme-views";

export type ProgrammeStore = {
  /** In display order. */
  list(workspaceId: string, includeArchived: boolean): Promise<ProgrammeView[]>;
  find(workspaceId: string, id: string): Promise<ProgrammeView | null>;
  /** Another Programme that is not archived has this name, ignoring case. */
  nameTaken(
    workspaceId: string,
    name: string,
    exceptId?: string,
  ): Promise<boolean>;
  /** Adds it at the end of the order. */
  create(workspaceId: string, fields: ProgrammeFields): Promise<ProgrammeView>;
  update(
    workspaceId: string,
    id: string,
    fields: ProgrammeFields,
  ): Promise<ProgrammeView>;
  setArchivedAt(
    workspaceId: string,
    id: string,
    archivedAt: Date | null,
  ): Promise<ProgrammeView>;
  /** Classrooms of the current Academic Year that are not archived. */
  currentClassroomCount(
    workspaceId: string,
    programmeId: string,
  ): Promise<number>;
  /** Every Programme id, in its new order. */
  setOrder(workspaceId: string, ids: readonly string[]): Promise<void>;
};
