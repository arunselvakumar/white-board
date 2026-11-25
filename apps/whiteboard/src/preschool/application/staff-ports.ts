import type { StaffRole } from "../domain/staff";
import type { StaffView } from "./staff-views";

export type StaffRecord = {
  id: string;
  centreId: string;
  name: string;
  role: StaffRole;
  status: "active" | "inactive";
  email: string | null;
};

export type StaffFields = {
  name: string;
  role: StaffRole;
  phone: string | null;
  email: string | null;
  designation: string | null;
  /** YYYY-MM-DD */
  joinedOn: string | null;
};

export type StaffStore = {
  /** A Centre's Staff that are not deleted, by name. */
  list(workspaceId: string, centreId: string): Promise<StaffView[]>;
  find(workspaceId: string, id: string): Promise<StaffRecord | null>;
  view(workspaceId: string, id: string): Promise<StaffView>;
  /** Another Staff member of the Workspace that is not deleted has this email. */
  emailTaken(
    workspaceId: string,
    email: string,
    exceptId?: string,
  ): Promise<boolean>;
  /** Classrooms that are not deleted, by id. Missing ids are left out. */
  classrooms(
    workspaceId: string,
    ids: readonly string[],
  ): Promise<
    { id: string; name: string; centreId: string; isArchived: boolean }[]
  >;
  /** Returns the new id. */
  create(
    workspaceId: string,
    input: StaffFields & { centreId: string; classroomIds: readonly string[] },
  ): Promise<string>;
  update(
    workspaceId: string,
    id: string,
    fields: StaffFields,
    effects: { removeClassrooms: boolean; clearInvitedAt: boolean },
  ): Promise<void>;
  /** Deactivating also removes the member's Class Teacher links. */
  setStatus(
    workspaceId: string,
    id: string,
    status: "active" | "inactive",
  ): Promise<void>;
  markInvited(workspaceId: string, id: string, at: Date): Promise<void>;
};

/** Sends a Workspace invitation with member role `teacher` (ADR-0055). */
export type StaffInviter = {
  invite(input: {
    workspaceId: string;
    inviterUserId: string;
    email: string;
  }): Promise<"sent" | "already_member">;
};
