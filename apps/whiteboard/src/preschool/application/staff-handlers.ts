import { conflict, invalid, notFound } from "../domain/errors";
import {
  assertClassroomsAllowed,
  assertMayManageStaffRole,
  canSignIn,
  staffEmail,
  staffName,
  type StaffRole,
} from "../domain/staff";
import { assertManagerOf, type PreschoolActor } from "./access";
import type {
  StaffFields,
  StaffInviter,
  StaffRecord,
  StaffStore,
} from "./staff-ports";
import type {
  StaffInvitationOutcome,
  StaffInvitationView,
  StaffListView,
  StaffView,
} from "./staff-views";

export type StaffDetailsInput = {
  name: string;
  role: StaffRole;
  phone?: string | null;
  email?: string | null;
  designation?: string | null;
  /** YYYY-MM-DD */
  joinedOn?: string | null;
};

export type CreateStaffInput = StaffDetailsInput & {
  centreId: string;
  classroomIds?: readonly string[];
};

function blankToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
}

function fields(input: StaffDetailsInput): StaffFields {
  return {
    name: staffName(input.name),
    role: input.role,
    phone: blankToNull(input.phone),
    email: staffEmail(input.email),
    designation: blankToNull(input.designation),
    joinedOn: input.joinedOn ?? null,
  };
}

/**
 * Staff of a Centre. Managers of the Centre add and change them; only the
 * Owner touches a Centre Head. A Centre Head or Teacher with an email is
 * invited to sign in; a failed invitation never fails the save.
 */
export class StaffHandlers {
  constructor(
    private readonly deps: {
      store: StaffStore;
      inviter: StaffInviter;
      now: () => Date;
    },
  ) {}

  async list(
    actor: PreschoolActor,
    query: { centreId: string },
  ): Promise<StaffListView> {
    assertManagerOf(actor, query.centreId);
    return {
      items: await this.deps.store.list(actor.workspaceId, query.centreId),
    };
  }

  async create(
    actor: PreschoolActor,
    input: CreateStaffInput,
  ): Promise<StaffInvitationView> {
    assertManagerOf(actor, input.centreId);
    assertMayManageStaffRole(actor.role === "owner", input.role);
    const staff = fields(input);
    const classroomIds = [...new Set(input.classroomIds ?? [])];
    assertClassroomsAllowed(staff.role, classroomIds);
    await this.assertClassroomsOf(
      actor.workspaceId,
      input.centreId,
      classroomIds,
    );
    await this.assertEmailFree(actor.workspaceId, staff.email);
    const id = await this.deps.store.create(actor.workspaceId, {
      ...staff,
      centreId: input.centreId,
      classroomIds,
    });
    const invitation =
      canSignIn(staff.role) && staff.email != null
        ? await this.sendInvitation(actor, id, staff.email)
        : "not_sent";
    return {
      staff: await this.deps.store.view(actor.workspaceId, id),
      invitation,
    };
  }

  async updateDetails(
    actor: PreschoolActor,
    id: string,
    input: StaffDetailsInput,
  ): Promise<StaffView> {
    const current = await this.findManaged(actor, id, input.role);
    const staff = fields(input);
    await this.assertEmailFree(actor.workspaceId, staff.email, id);
    await this.deps.store.update(actor.workspaceId, id, staff, {
      removeClassrooms: !canSignIn(staff.role),
      clearInvitedAt: staff.email !== current.email,
    });
    return this.deps.store.view(actor.workspaceId, id);
  }

  async deactivate(actor: PreschoolActor, id: string): Promise<StaffView> {
    await this.findManaged(actor, id);
    await this.deps.store.setStatus(actor.workspaceId, id, "inactive");
    return this.deps.store.view(actor.workspaceId, id);
  }

  async activate(actor: PreschoolActor, id: string): Promise<StaffView> {
    await this.findManaged(actor, id);
    await this.deps.store.setStatus(actor.workspaceId, id, "active");
    return this.deps.store.view(actor.workspaceId, id);
  }

  async invite(
    actor: PreschoolActor,
    id: string,
  ): Promise<StaffInvitationView> {
    const staff = await this.findManaged(actor, id);
    if (staff.status !== "active")
      throw conflict("STAFF_INACTIVE", `${staff.name} is inactive.`);
    if (!canSignIn(staff.role))
      throw conflict(
        "STAFF_CANNOT_SIGN_IN",
        "Helpers do not sign in, so they are not invited.",
      );
    if (staff.email == null)
      throw conflict(
        "STAFF_EMAIL_REQUIRED",
        `Add ${staff.name}'s email before inviting them.`,
      );
    const invitation = await this.sendInvitation(actor, id, staff.email);
    return {
      staff: await this.deps.store.view(actor.workspaceId, id),
      invitation,
    };
  }

  /** Found in the Workspace, in a Centre the actor manages, in a role they may change. */
  private async findManaged(
    actor: PreschoolActor,
    id: string,
    newRole?: StaffRole,
  ): Promise<StaffRecord> {
    const staff = await this.deps.store.find(actor.workspaceId, id);
    if (staff == null) throw notFound("STAFF_NOT_FOUND", "Staff not found.");
    assertManagerOf(actor, staff.centreId);
    assertMayManageStaffRole(
      actor.role === "owner",
      staff.role,
      ...(newRole == null ? [] : [newRole]),
    );
    return staff;
  }

  private async sendInvitation(
    actor: PreschoolActor,
    staffId: string,
    email: string,
  ): Promise<StaffInvitationOutcome> {
    try {
      const outcome = await this.deps.inviter.invite({
        workspaceId: actor.workspaceId,
        inviterUserId: actor.userId,
        email,
      });
      if (outcome === "sent")
        await this.deps.store.markInvited(
          actor.workspaceId,
          staffId,
          this.deps.now(),
        );
      return outcome;
    } catch (error) {
      console.error("Staff invitation failed", { staffId }, error);
      return "failed";
    }
  }

  private async assertEmailFree(
    workspaceId: string,
    email: string | null,
    exceptId?: string,
  ): Promise<void> {
    if (
      email != null &&
      (await this.deps.store.emailTaken(workspaceId, email, exceptId))
    )
      throw conflict(
        "STAFF_EMAIL_IN_USE",
        `${email} already belongs to another Staff member.`,
      );
  }

  private async assertClassroomsOf(
    workspaceId: string,
    centreId: string,
    ids: readonly string[],
  ): Promise<void> {
    if (ids.length === 0) return;
    const classrooms = await this.deps.store.classrooms(workspaceId, ids);
    if (classrooms.length !== ids.length)
      throw notFound("CLASSROOM_NOT_FOUND", "Classroom not found.");
    for (const classroom of classrooms) {
      if (classroom.centreId !== centreId)
        throw invalid(
          "CLASSROOM_OTHER_CENTRE",
          `${classroom.name} belongs to another Centre.`,
        );
      if (classroom.isArchived)
        throw conflict("CLASSROOM_ARCHIVED", `${classroom.name} is archived.`);
    }
  }
}
