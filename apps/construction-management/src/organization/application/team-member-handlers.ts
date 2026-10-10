import {
  PermissionSet,
  type Flag,
  type MemberAccess,
} from "@/src/shared-kernel/access";
import type { AuditEvent } from "@/src/shared-kernel/audit";
import {
  DomainError,
  conflict,
  notFound,
} from "@/src/shared-kernel/domain-error";
import type { EventDispatcher } from "@/src/shared-kernel/events";
import { newId } from "@/src/shared-kernel/ids";

import type { DesignationRepository } from "../domain/designation-repository";
import { applyTemplate, type MemberType } from "../domain/starting-permissions";
import { TeamMember, teamMemberDetails } from "../domain/team-member";
import type {
  TeamMemberListParams,
  TeamMemberRepository,
} from "../domain/team-member-repository";
import { assertCanGrant } from "./grant-rules";
import type { PlanGate } from "./plan-gate";
import {
  toTeamMemberReadModel,
  type TeamMemberReadModel,
} from "./team-member-read-model";

export type TeamMemberDetailsInput = {
  name: string;
  designationId: string;
  mobile?: string | null;
  email?: string | null;
  address?: string | null;
  aadhaar?: string | null;
  pan?: string | null;
  emergencyContact?: string | null;
};

type Grants = Readonly<Partial<Record<string, readonly Flag[]>>>;

/** One line of a Project's Resources (CM-406). */
export type ProjectTeamMemberReadModel = {
  id: string;
  name: string;
  /** Designation, and "Joining Pending" until they accept. */
  detail: string | null;
  /** False for a declined Join Request: it stays but cannot be added again. */
  isActive: boolean;
  /** The Owner is on every Project and cannot be taken off. */
  isOwner: boolean;
};

/** Raised when a Team Member is added or invited again; CM-109 notifies them. */
export type TeamMemberInvited = {
  type: "TeamMemberInvited";
  workspaceId: string;
  memberId: string;
  occurredAt: Date;
};

/**
 * Team Member commands and queries (CM-108). Routes check the Permission
 * Matrix (`organization.team_members`) before calling these.
 */
export class TeamMemberHandlers {
  constructor(
    private readonly members: TeamMemberRepository,
    private readonly designations: DesignationRepository,
    private readonly plan: PlanGate,
    private readonly events: EventDispatcher,
    private readonly clock: () => Date = () => new Date(),
    /** Whether a mobile is a way to sign in (SMS on, ADR CM-0009). */
    private readonly mobileSignIn: () => boolean = () => true,
  ) {}

  private async load(workspaceId: string, id: string): Promise<TeamMember> {
    const member = await this.members.findById(workspaceId, id);
    if (member == null)
      throw notFound(
        "TEAM_MEMBER_NOT_FOUND",
        "This Team Member was not found.",
      );
    return member;
  }

  private async designation(workspaceId: string, id: string) {
    const designation = await this.designations.findById(workspaceId, id);
    if (designation == null)
      throw new DomainError(
        "DESIGNATION_NOT_FOUND",
        "Choose a Designation from the list.",
      );
    return designation;
  }

  private async names(workspaceId: string): Promise<Map<string, string>> {
    const all = await this.designations.listAll(workspaceId);
    return new Map(all.map((item) => [item.id, item.name]));
  }

  private async view(member: TeamMember): Promise<TeamMemberReadModel> {
    return toTeamMemberReadModel(member, await this.names(member.workspaceId));
  }

  private audit(
    member: TeamMember,
    by: string,
    action: string,
    before?: unknown,
  ): AuditEvent {
    return {
      workspaceId: member.workspaceId,
      actorUserId: by,
      action,
      entityType: "team_member",
      entityId: member.id,
      before,
      after: {
        name: member.details.name,
        designationId: member.details.designationId,
        memberType: member.memberType,
        status: member.status,
        projectIds: member.projectIds,
        permissions: member.permissions.toGrants(),
      },
    };
  }

  private async invited(member: TeamMember): Promise<void> {
    const event: TeamMemberInvited = {
      type: "TeamMemberInvited",
      workspaceId: member.workspaceId,
      memberId: member.id,
      occurredAt: this.clock(),
    };
    await this.events.dispatch([event]);
  }

  async list(params: TeamMemberListParams): Promise<{
    items: TeamMemberReadModel[];
    total: number;
    hasMore: boolean;
  }> {
    const [page, names] = await Promise.all([
      this.members.list(params),
      this.names(params.workspaceId),
    ]);
    return {
      items: page.items.map((member) => toTeamMemberReadModel(member, names)),
      total: page.total,
      hasMore: page.hasMore,
    };
  }

  async get(workspaceId: string, id: string): Promise<TeamMemberReadModel> {
    return this.view(await this.load(workspaceId, id));
  }

  /** Add Team Member: Joining Pending with an invite link (wizard steps 1–3). */
  async invite(input: {
    workspaceId: string;
    by: string;
    /** Who is granting the matrix; the Owner when omitted (tests, seeds). */
    grantor?: MemberAccess;
    details: TeamMemberDetailsInput;
    memberType: MemberType;
    projectIds?: readonly string[];
    /** The matrix from step 3; the Designation's template when omitted. */
    permissions?: Grants;
  }): Promise<TeamMemberReadModel> {
    const now = this.clock();
    const details = teamMemberDetails(input.details);
    const designation = await this.designation(
      input.workspaceId,
      details.designationId,
    );
    await this.plan.assertCanAdd(
      input.workspaceId,
      input.memberType === "hrms" ? "hrms_member" : "team_member",
    );
    const permissions =
      input.memberType === "hrms" || input.permissions == null
        ? applyTemplate(designation, input.memberType)
        : PermissionSet.fromGrants(input.permissions);
    if (input.grantor != null)
      assertCanGrant(input.grantor, permissions, { userId: null });
    const member = TeamMember.invite({
      id: newId(now.getTime()),
      workspaceId: input.workspaceId,
      details,
      memberType: input.memberType,
      projectIds: input.memberType === "hrms" ? [] : (input.projectIds ?? []),
      permissions,
      by: input.by,
      now,
    });
    await this.members.save(
      member,
      this.audit(member, input.by, "team_member.invited"),
    );
    await this.invited(member);
    return this.view(member);
  }

  /** Edit details; changing Member Type restarts the matrix from its default. */
  async update(input: {
    workspaceId: string;
    id: string;
    by: string;
    grantor?: MemberAccess;
    details: TeamMemberDetailsInput;
    memberType: MemberType;
  }): Promise<TeamMemberReadModel> {
    const now = this.clock();
    const member = await this.load(input.workspaceId, input.id);
    const before = this.audit(member, input.by, "").after;
    // Screens only ever hold masked identifiers: leaving Aadhaar or PAN out
    // keeps what is stored; null clears it.
    const details = teamMemberDetails({
      ...input.details,
      aadhaar:
        input.details.aadhaar === undefined
          ? member.details.aadhaar
          : input.details.aadhaar,
      pan:
        input.details.pan === undefined
          ? member.details.pan
          : input.details.pan,
    });
    const designation = await this.designation(
      input.workspaceId,
      details.designationId,
    );
    member.updateDetails(details, input.by, now, {
      mobileIsSignIn: this.mobileSignIn(),
    });
    if (input.memberType !== member.memberType) {
      if (input.memberType === "hrms")
        await this.plan.assertCanAdd(input.workspaceId, "hrms_member");
      else await this.plan.assertCanAdd(input.workspaceId, "team_member");
      const restarted = applyTemplate(designation, input.memberType);
      if (input.grantor != null)
        assertCanGrant(input.grantor, restarted, member);
      member.changeType(input.memberType, restarted, input.by, now);
    }
    await this.members.save(
      member,
      this.audit(member, input.by, "team_member.updated", before),
    );
    return this.view(member);
  }

  async setPermissions(input: {
    workspaceId: string;
    id: string;
    by: string;
    grantor?: MemberAccess;
    permissions: Grants;
  }): Promise<TeamMemberReadModel> {
    const member = await this.load(input.workspaceId, input.id);
    const before = member.permissions.toGrants();
    const permissions = PermissionSet.fromGrants(input.permissions);
    if (input.grantor != null)
      assertCanGrant(input.grantor, permissions, member);
    member.setPermissions(permissions, input.by, this.clock());
    await this.members.save(
      member,
      this.audit(member, input.by, "team_member.permissions_changed", {
        permissions: before,
      }),
    );
    return this.view(member);
  }

  async assignProjects(input: {
    workspaceId: string;
    id: string;
    by: string;
    projectIds: readonly string[];
  }): Promise<TeamMemberReadModel> {
    const member = await this.load(input.workspaceId, input.id);
    const before = { projectIds: member.projectIds };
    member.assignToProjects(input.projectIds, input.by, this.clock());
    await this.members.save(
      member,
      this.audit(member, input.by, "team_member.projects_changed", before),
    );
    return this.view(member);
  }

  private async projectLines(
    workspaceId: string,
    members: readonly TeamMember[],
  ): Promise<ProjectTeamMemberReadModel[]> {
    const names = await this.names(workspaceId);
    return members.map((member) => {
      const designation = names.get(member.details.designationId) ?? null;
      const pending =
        member.status === "joining_pending" ? "Joining Pending" : null;
      const detail = [designation, pending].filter(Boolean).join(" · ");
      return {
        id: member.id,
        name: member.details.name,
        detail: detail === "" ? null : detail,
        isActive: member.status !== "rejected",
        isOwner: member.isOwner,
      };
    });
  }

  /**
   * A Project's Team Members for its Resources (CM-406): the Owner, who is
   * on every Project without being assigned, and those assigned, by name.
   */
  async projectTeam(
    workspaceId: string,
    projectId: string,
  ): Promise<ProjectTeamMemberReadModel[]> {
    const members = await this.members.listForProject(workspaceId, projectId);
    const owners = members.filter((member) => member.isOwner);
    const others = members.filter((member) => !member.isOwner);
    return this.projectLines(workspaceId, [...owners, ...others]);
  }

  /** Who a Project's Resources can add: Normal, not declined, not the Owner. */
  async assignableToProjects(
    workspaceId: string,
  ): Promise<ProjectTeamMemberReadModel[]> {
    return this.projectLines(
      workspaceId,
      await this.members.listAssignable(workspaceId),
    );
  }

  /**
   * Makes `ids` the Team Members assigned to the Project (Resources,
   * CM-406), keeping the rules of Assign Projects: HRMS Team Members are on
   * no Project (400 `HRMS_MEMBER_HAS_NO_PROJECTS`) and the Owner is on
   * every Project, so the Owner's id is ignored. `expectedIds` is the set
   * the screen loaded (409 `PROJECT_RESOURCES_CHANGED` when it moved); 400
   * `TEAM_MEMBER_NOT_FOUND` for an id that is not a live Team Member of
   * the Company, `TEAM_MEMBER_DECLINED` for a declined one newly added.
   * The caller has checked the Project is live and visible.
   */
  async setProjectTeam(input: {
    workspaceId: string;
    projectId: string;
    ids: readonly string[];
    expectedIds: readonly string[];
    by: string;
  }): Promise<void> {
    const current = (
      await this.members.listForProject(input.workspaceId, input.projectId)
    ).filter((member) => !member.isOwner);
    const currentIds = new Set(current.map((member) => member.id));
    const expected = new Set(input.expectedIds);
    if (
      expected.size !== currentIds.size ||
      [...expected].some((id) => !currentIds.has(id))
    )
      throw conflict(
        "PROJECT_RESOURCES_CHANGED",
        "Someone else changed this Project's Resources after you opened them. Reload to see their changes.",
      );
    const addedIds = [...new Set(input.ids)].filter(
      (id) => !currentIds.has(id),
    );
    const found = await this.members.findByIds(input.workspaceId, addedIds);
    const foundIds = new Set(found.map((member) => member.id));
    const missing = addedIds.filter((id) => !foundIds.has(id));
    if (missing.length > 0)
      throw new DomainError(
        "TEAM_MEMBER_NOT_FOUND",
        "Choose Team Members from the list. One of them was not found.",
        { details: { ids: missing } },
      );
    const added = found.filter((member) => !member.isOwner);
    const wanted = new Set([
      ...added.map((member) => member.id),
      ...input.ids.filter((id) => currentIds.has(id)),
    ]);
    const now = this.clock();
    const entries: { member: TeamMember; audit: AuditEvent }[] = [];
    for (const member of added) {
      if (member.status === "rejected")
        throw new DomainError(
          "TEAM_MEMBER_DECLINED",
          `${member.details.name} declined the Join Request, so they cannot be added to a Project.`,
          { details: { id: member.id } },
        );
      const before = { projectIds: member.projectIds };
      member.assignToProjects(
        [...member.projectIds, input.projectId],
        input.by,
        now,
      );
      entries.push({
        member,
        audit: this.audit(
          member,
          input.by,
          "team_member.projects_changed",
          before,
        ),
      });
    }
    for (const member of current) {
      if (wanted.has(member.id)) continue;
      const before = { projectIds: member.projectIds };
      member.assignToProjects(
        member.projectIds.filter((id) => id !== input.projectId),
        input.by,
        now,
      );
      entries.push({
        member,
        audit: this.audit(
          member,
          input.by,
          "team_member.projects_changed",
          before,
        ),
      });
    }
    await this.members.saveMany(entries);
  }

  /**
   * A fresh invite link, sent again. While SMS is off the invitation goes
   * only by email, so a member without one cannot be invited (ADR CM-0009).
   */
  async resendInvite(input: {
    workspaceId: string;
    id: string;
    by: string;
  }): Promise<TeamMemberReadModel> {
    const member = await this.load(input.workspaceId, input.id);
    if (
      member.status !== "active" &&
      member.details.email == null &&
      !this.mobileSignIn()
    )
      throw conflict(
        "MEMBER_EMAIL_REQUIRED",
        "Add an email to invite this Team Member.",
      );
    member.resendInvite(input.by, this.clock());
    await this.members.save(
      member,
      this.audit(member, input.by, "team_member.invite_resent"),
    );
    await this.invited(member);
    return this.view(member);
  }

  /** Tombstones the record; the caller removes the membership (CM-110). */
  async remove(input: {
    workspaceId: string;
    id: string;
    by: string;
  }): Promise<{ userId: string | null }> {
    const member = await this.load(input.workspaceId, input.id);
    member.remove(input.by, this.clock());
    await this.members.save(
      member,
      this.audit(member, input.by, "team_member.removed"),
    );
    return { userId: member.userId };
  }

  /**
   * The full Aadhaar and PAN. Logged every time; OTP-gating arrives with M9
   * (CM-108 "reveal").
   */
  async revealIdentifiers(input: {
    workspaceId: string;
    id: string;
    by: string;
  }): Promise<{ aadhaar: string | null; pan: string | null }> {
    const member = await this.load(input.workspaceId, input.id);
    await this.members.save(member, {
      workspaceId: member.workspaceId,
      actorUserId: input.by,
      action: "team_member.identifiers_revealed",
      entityType: "team_member",
      entityId: member.id,
    });
    return { aadhaar: member.details.aadhaar, pan: member.details.pan };
  }
}
