import type { MemberAccess } from "@/src/shared-kernel/access";
import type { AuditEvent } from "@/src/shared-kernel/audit";
import {
  DomainError,
  conflict,
  notFound,
} from "@/src/shared-kernel/domain-error";
import type { EventDispatcher } from "@/src/shared-kernel/events";
import { newId } from "@/src/shared-kernel/ids";

import type { DesignationRepository } from "../domain/designation-repository";
import type { Role } from "../domain/role";
import type { RoleRepository } from "../domain/role-repository";
import {
  TeamMember,
  teamMemberDetails,
  type MemberType,
} from "../domain/team-member";
import type {
  TeamMemberListParams,
  TeamMemberRepository,
} from "../domain/team-member-repository";
import type { CompanyMemberships } from "./company-memberships";
import { assertCanGrant, assertNotOwnRole } from "./grant-rules";
import type { PlanGate } from "./plan-gate";
import type { SignInAccounts } from "./sign-in-accounts";
import {
  toTeamMemberReadModel,
  type TeamMemberLookups,
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

/** A first password is 8–128 characters, as Better Auth's own rule. */
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

/**
 * Why a password the admin typed was not used: someone already signs in
 * with that mobile or email, so they get a Join Request instead (ADR
 * CM-0030 §3).
 */
export type PasswordIgnored = "existing_account" | null;

export type TeamMemberWithPassword = TeamMemberReadModel & {
  passwordIgnored: PasswordIgnored;
};

function assertPassword(password: string): void {
  if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX)
    throw new DomainError(
      "PASSWORD_INVALID",
      `The password must be ${String(PASSWORD_MIN)} to ${String(PASSWORD_MAX)} characters.`,
    );
}

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
 * Team Member commands and queries (CM-108); screens call them Staff (ADR
 * CM-0032). Routes check the Permission Matrix (`organization.team_members`)
 * before calling these.
 */
export class TeamMemberHandlers {
  constructor(
    private readonly members: TeamMemberRepository,
    private readonly designations: DesignationRepository,
    private readonly roles: RoleRepository,
    private readonly plan: PlanGate,
    private readonly events: EventDispatcher,
    private readonly clock: () => Date = () => new Date(),
    /** Whether a mobile is a way to sign in by code (SMS on, ADR CM-0009). */
    private readonly mobileSignIn: () => boolean = () => true,
    /** Without them, setting a password is refused (unit tests). */
    private readonly accounts?: SignInAccounts,
    private readonly memberships?: CompanyMemberships,
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

  private async role(workspaceId: string, id: string): Promise<Role> {
    const role = await this.roles.findById(workspaceId, id);
    if (role == null)
      throw new DomainError("ROLE_NOT_FOUND", "Choose a Role from the list.");
    return role;
  }

  private async names(workspaceId: string): Promise<Map<string, string>> {
    const all = await this.designations.listAll(workspaceId);
    return new Map(all.map((item) => [item.id, item.name]));
  }

  private async lookups(
    workspaceId: string,
    members: readonly TeamMember[],
  ): Promise<TeamMemberLookups> {
    const userIds = members.flatMap((member) =>
      member.userId == null || member.isOwner ? [] : [member.userId],
    );
    const [designationNames, roles, usersInOtherCompanies] = await Promise.all([
      this.names(workspaceId),
      this.roles.listAll(workspaceId),
      userIds.length === 0 || this.accounts == null
        ? new Set<string>()
        : this.accounts.inOtherCompanies(workspaceId, userIds),
    ]);
    return {
      designationNames,
      roles: new Map(roles.map((role) => [role.id, role])),
      usersInOtherCompanies,
    };
  }

  private async view(member: TeamMember): Promise<TeamMemberReadModel> {
    return toTeamMemberReadModel(
      member,
      await this.lookups(member.workspaceId, [member]),
    );
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
        roleId: member.roleId,
        monthlySalary: member.monthlySalary,
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
    const page = await this.members.list(params);
    const lookups = await this.lookups(params.workspaceId, page.items);
    return {
      items: page.items.map((member) => toTeamMemberReadModel(member, lookups)),
      total: page.total,
      hasMore: page.hasMore,
    };
  }

  async get(workspaceId: string, id: string): Promise<TeamMemberReadModel> {
    return this.view(await this.load(workspaceId, id));
  }

  /**
   * Whether an invitation can reach them: an email, or a mobile while SMS
   * is on (ADR CM-0009).
   */
  private reachable(member: TeamMember): boolean {
    return (
      member.details.email != null ||
      (member.details.mobile != null && this.mobileSignIn())
    );
  }

  /**
   * Add Staff (ADR CM-0030 §6). Joining Pending with an invite link; then
   * one of three outcomes:
   *
   * - `password`: the sign-in account is made and the member is Active at
   *   once, to change it at first sign-in — unless a User already has that
   *   mobile or email: the password is ignored (`passwordIgnored:
   *   "existing_account"`) and they get an ordinary Join Request, invited
   *   when there is an email.
   * - `invite` true: the invitation goes out; 400 `MEMBER_EMAIL_REQUIRED`
   *   when nothing can carry it (an email, or a mobile while SMS is on).
   * - `invite` false: a record only, to invite later.
   *
   * Omitting `invite` invites when an invitation can reach them (seeds,
   * tests). The grantor must hold every cell of the Role (403
   * `CANNOT_GRANT`); without a Role the member can do nothing.
   */
  async invite(input: {
    workspaceId: string;
    by: string;
    /** Who is giving the Role; the Owner when omitted (tests, seeds). */
    grantor?: MemberAccess;
    details: TeamMemberDetailsInput;
    /** Paise a month; the route drops it without Financial (ADR CM-0032). */
    monthlySalary?: number | null;
    memberType: MemberType;
    projectIds?: readonly string[];
    roleId?: string | null;
    invite?: boolean;
    password?: string | null;
  }): Promise<TeamMemberWithPassword> {
    const now = this.clock();
    const details = teamMemberDetails(input.details);
    await this.designation(input.workspaceId, details.designationId);
    const role =
      input.roleId == null
        ? null
        : await this.role(input.workspaceId, input.roleId);
    const password = input.password ?? null;
    if (password != null) {
      assertPassword(password);
      this.passwordAccounts();
    }
    await this.plan.assertCanAdd(
      input.workspaceId,
      input.memberType === "hrms" ? "hrms_member" : "team_member",
    );
    if (input.grantor != null && role != null)
      assertCanGrant(input.grantor, role.permissions);
    const member = TeamMember.invite({
      id: newId(now.getTime()),
      workspaceId: input.workspaceId,
      details,
      monthlySalary: input.monthlySalary,
      memberType: input.memberType,
      projectIds: input.memberType === "hrms" ? [] : (input.projectIds ?? []),
      roleId: role?.id ?? null,
      by: input.by,
      now,
    });
    if (password == null && input.invite === true && !this.reachable(member))
      throw new DomainError(
        "MEMBER_EMAIL_REQUIRED",
        "Enter an email to invite them, or set a password for them.",
      );
    await this.members.save(
      member,
      this.audit(member, input.by, "team_member.invited"),
    );
    if (password != null) return this.giveAccount(member, password, input.by);
    if (input.invite ?? this.reachable(member)) await this.invited(member);
    return { ...(await this.view(member)), passwordIgnored: null };
  }

  private passwordAccounts(): {
    accounts: SignInAccounts;
    memberships: CompanyMemberships;
  } {
    if (this.accounts == null || this.memberships == null)
      throw new Error("Setting a password needs the sign-in accounts.");
    return { accounts: this.accounts, memberships: this.memberships };
  }

  /**
   * A member without a User gets one with `password` (ADR CM-0030 §3, §6):
   * made, added to the Company and linked, so they are Active. When a User
   * already has their mobile or email, the password is ignored and the
   * member stays (or is again) a Join Request, invited when there is an
   * email.
   */
  private async giveAccount(
    member: TeamMember,
    password: string,
    by: string,
  ): Promise<TeamMemberWithPassword> {
    const { accounts, memberships } = this.passwordAccounts();
    const { details } = member;
    const account = await accounts.createPasswordAccount({
      name: details.name,
      email: details.email,
      phoneNumber: details.mobile,
      password,
    });
    if (!account.created) {
      if (member.status !== "joining_pending") {
        member.resendInvite(by, this.clock());
        await this.members.save(
          member,
          this.audit(member, by, "team_member.invite_resent"),
        );
      }
      if (details.email != null) await this.invited(member);
      return {
        ...(await this.view(member)),
        passwordIgnored: "existing_account",
      };
    }
    await memberships.addMember({
      workspaceId: member.workspaceId,
      userId: account.userId,
    });
    member.linkAccount(account.userId, by, this.clock());
    try {
      await this.members.save(
        member,
        this.audit(member, by, "team_member.account_created"),
      );
    } catch (error) {
      await memberships.removeMember({
        workspaceId: member.workspaceId,
        userId: account.userId,
      });
      throw error;
    }
    return { ...(await this.view(member)), passwordIgnored: null };
  }

  /**
   * Edit details, salary and Member Type; the Role stays (ADR CM-0030).
   * `monthlySalary` left out keeps the stored one (a member without
   * Financial never sees it); null clears it (ADR CM-0032).
   */
  async update(input: {
    workspaceId: string;
    id: string;
    by: string;
    details: TeamMemberDetailsInput;
    monthlySalary?: number | null;
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
    await this.designation(input.workspaceId, details.designationId);
    member.updateDetails(details, input.by, now, {
      mobileIsSignIn: this.mobileSignIn(),
    });
    if (input.monthlySalary !== undefined)
      member.setMonthlySalary(input.monthlySalary, input.by, now);
    if (input.memberType !== member.memberType) {
      if (input.memberType === "hrms")
        await this.plan.assertCanAdd(input.workspaceId, "hrms_member");
      else await this.plan.assertCanAdd(input.workspaceId, "team_member");
      member.changeType(input.memberType, input.by, now);
    }
    await this.members.save(
      member,
      this.audit(member, input.by, "team_member.updated", before),
    );
    return this.view(member);
  }

  /**
   * Gives the member another Role (ADR CM-0030). 409 `OWNER_HAS_NO_ROLE`
   * for the Owner; 403 `OWN_ROLE` for the grantor's own record and
   * `CANNOT_GRANT` for a cell of the Role the grantor lacks.
   */
  async setRole(input: {
    workspaceId: string;
    id: string;
    by: string;
    grantor?: MemberAccess;
    roleId: string;
  }): Promise<TeamMemberReadModel> {
    const member = await this.load(input.workspaceId, input.id);
    const role = await this.role(input.workspaceId, input.roleId);
    if (input.grantor != null && !member.isOwner) {
      assertNotOwnRole(input.grantor, { userId: member.userId });
      assertCanGrant(input.grantor, role.permissions);
    }
    const before = { roleId: member.roleId };
    member.setRole(role.id, input.by, this.clock());
    await this.members.save(
      member,
      this.audit(member, input.by, "team_member.role_changed", before),
    );
    return this.view(member);
  }

  /**
   * Set a new password (ADR CM-0030 §7). Without a User yet, as Add User
   * with a password. With one: only when that User belongs to no other
   * Company (409 `USER_IN_OTHER_COMPANY`), never the Owner's (409
   * `OWNER_PASSWORD`); they must change it at their next sign-in and every
   * session of theirs ends.
   */
  async setPassword(input: {
    workspaceId: string;
    id: string;
    by: string;
    /** Who is setting it; the Owner when omitted (tests, seeds). */
    grantor?: MemberAccess;
    password: string;
  }): Promise<TeamMemberWithPassword> {
    const member = await this.load(input.workspaceId, input.id);
    if (member.isOwner)
      throw conflict("OWNER_PASSWORD", "The Owner changes their own password.");
    if (input.grantor != null) {
      // Whoever sets a password can sign in as that person, so they must
      // already hold everything that person can do, and it is never their
      // own (they use Change password).
      assertNotOwnRole(input.grantor, { userId: member.userId });
      if (member.roleId != null)
        assertCanGrant(
          input.grantor,
          (await this.role(input.workspaceId, member.roleId)).permissions,
        );
    }
    assertPassword(input.password);
    const { accounts } = this.passwordAccounts();
    if (member.userId == null)
      return this.giveAccount(member, input.password, input.by);
    const others = await accounts.inOtherCompanies(input.workspaceId, [
      member.userId,
    ]);
    if (others.has(member.userId))
      throw conflict(
        "USER_IN_OTHER_COMPANY",
        "This User also works with another Company, so only they can change their password.",
      );
    await accounts.setTemporaryPassword(member.userId, input.password);
    await this.members.save(member, {
      workspaceId: member.workspaceId,
      actorUserId: input.by,
      action: "team_member.password_set",
      entityType: "team_member",
      entityId: member.id,
    });
    return { ...(await this.view(member)), passwordIgnored: null };
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
   * The full Aadhaar and PAN. Logged every time; the route first checks a
   * reveal code verified in the session (CM-108, ADR CM-0021 §11).
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
