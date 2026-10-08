import { PermissionSet, type Flag } from "@/src/shared-kernel/access";
import type { AuditEvent } from "@/src/shared-kernel/audit";
import { DomainError, notFound } from "@/src/shared-kernel/domain-error";
import type { EventDispatcher } from "@/src/shared-kernel/events";
import { newId } from "@/src/shared-kernel/ids";

import type { DesignationRepository } from "../domain/designation-repository";
import { applyTemplate, type MemberType } from "../domain/starting-permissions";
import { TeamMember, teamMemberDetails } from "../domain/team-member";
import type {
  TeamMemberListParams,
  TeamMemberRepository,
} from "../domain/team-member-repository";
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

type Grants = Readonly<Record<string, readonly Flag[]>>;

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
    details: TeamMemberDetailsInput;
    memberType: MemberType;
  }): Promise<TeamMemberReadModel> {
    const now = this.clock();
    const member = await this.load(input.workspaceId, input.id);
    const before = this.audit(member, input.by, "").after;
    const details = teamMemberDetails(input.details);
    const designation = await this.designation(
      input.workspaceId,
      details.designationId,
    );
    member.updateDetails(details, input.by, now);
    if (input.memberType !== member.memberType) {
      if (input.memberType === "hrms")
        await this.plan.assertCanAdd(input.workspaceId, "hrms_member");
      else await this.plan.assertCanAdd(input.workspaceId, "team_member");
      member.changeType(
        input.memberType,
        applyTemplate(designation, input.memberType),
        input.by,
        now,
      );
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
    permissions: Grants;
  }): Promise<TeamMemberReadModel> {
    const member = await this.load(input.workspaceId, input.id);
    const before = member.permissions.toGrants();
    member.setPermissions(
      PermissionSet.fromGrants(input.permissions),
      input.by,
      this.clock(),
    );
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

  async resendInvite(input: {
    workspaceId: string;
    id: string;
    by: string;
  }): Promise<TeamMemberReadModel> {
    const member = await this.load(input.workspaceId, input.id);
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
