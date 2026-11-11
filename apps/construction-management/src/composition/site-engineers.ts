import { prisma, type PrismaClient } from "@repo/construction-db";

import type {
  SupervisorReadModel,
  SupervisorHandlers,
} from "@/src/masters/application/supervisor-handlers";
import type { LookupStatusFilter } from "@/src/masters/application/lookup-handlers";
import type {
  SiteEngineerBankInput,
  SiteEngineerProfileInput,
} from "@/src/masters/domain/site-engineer-profile";
import { createSupervisorHandlers } from "@/src/masters/infrastructure/create-masters-handlers";
import type { CompanyMemberships } from "@/src/organization/application/company-memberships";
import type {
  PasswordIgnored,
  TeamMemberHandlers,
} from "@/src/organization/application/team-member-handlers";
import type { TeamMemberReadModel } from "@/src/organization/application/team-member-read-model";
import type { RoleRepository } from "@/src/organization/domain/role-repository";
import type { StaffSalaryInput } from "@/src/organization/domain/staff-salary";
import type { TeamMemberStatus } from "@/src/organization/domain/team-member";
import { authCompanyMemberships } from "@/src/organization/infrastructure/auth-company-memberships";
import { createTeamMemberHandlers } from "@/src/organization/infrastructure/create-team-member-handlers";
import { PrismaRoleRepository } from "@/src/organization/infrastructure/prisma-role-repository";
import { SITE_ENGINEER_ROLE } from "@/src/organization/infrastructure/role-seeds";
import type { MemberAccess } from "@/src/shared-kernel/access";
import { DomainError, conflict } from "@/src/shared-kernel/domain-error";

/**
 * How a Site Engineer signs in (ADR CM-0037):
 *
 * - `site_engineer`: their own sign-in, made and managed on their page, on
 *   the Site Engineer Role, left off Office Staff.
 * - `office_staff`: they are an Office Staff member (linked before ADR
 *   CM-0037); that record is managed on Office Staff.
 * - `none`: an older Site Engineer without a sign-in; Edit adds one.
 */
export type SiteEngineerSignIn =
  | {
      kind: "site_engineer";
      memberId: string;
      status: TeamMemberStatus;
      canSetPassword: boolean;
      invitePath: string | null;
      invitedAt: Date | null;
      joinedAt: Date | null;
    }
  | { kind: "office_staff"; memberId: string; name: string }
  | { kind: "none" };

/** What the sign-in membership holds for a Site Engineer of their own. */
export type SiteEngineerMemberDetails = {
  email: string | null;
  address: string | null;
  aadhaarMasked: string | null;
  panMasked: string | null;
  emergencyContact: string | null;
  salaryType: TeamMemberReadModel["salaryType"];
  /** Paise; the route nulls them without Financial. */
  salaryPerDay: number | null;
  salaryPerMonth: number | null;
  overtimeWagePerHour: number;
  workingHoursPerDay: string;
  weeklyHolidays: number[];
  projectIds: string[];
};

export type SiteEngineerReadModel = SupervisorReadModel & {
  signIn: SiteEngineerSignIn;
  /** Null unless `signIn.kind` is `site_engineer`. */
  member: SiteEngineerMemberDetails | null;
};

export type SiteEngineerInput = {
  name: string;
  mobile: string | null;
  email: string | null;
  address: string | null;
  /** Left out on update keeps the stored one (screens hold the mask). */
  aadhaar?: string | null;
  pan?: string | null;
  emergencyContact: string | null;
  /** Left out without Financial; each field left out keeps the stored one. */
  salary?: StaffSalaryInput;
  projectIds: readonly string[];
  profile: SiteEngineerProfileInput;
  /** Left out without Financial, which keeps the stored details. */
  bank?: SiteEngineerBankInput;
};

/** An invitation, a first password, or both. */
export type SiteEngineerSignInInput = {
  invite: boolean;
  password: string | null;
};

export type SiteEngineerCreated = SiteEngineerReadModel & {
  passwordIgnored: PasswordIgnored;
  passwordSet: boolean;
  invited: boolean;
};

/** A Site Engineer on a Project's Resources (ADR CM-0038 §3). */
export type ProjectSiteEngineer = {
  /** The Site Engineer (`supervisors`) row, not their sign-in. */
  id: string;
  name: string;
  mobile: string | null;
  employeeCode: string | null;
  disabled: boolean;
};

/** One the Add Site Engineers picker lists; without a sign-in it is shown, not offered. */
export type ProjectSiteEngineerChoice = ProjectSiteEngineer & {
  hasSignIn: boolean;
};

function projectLine(item: SupervisorReadModel): ProjectSiteEngineer {
  return {
    id: item.id,
    name: item.name,
    mobile: item.mobile,
    employeeCode: item.profile.employeeCode,
    disabled: item.disabled,
  };
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  const left = new Set(a);
  const right = new Set(b);
  return left.size === right.size && [...left].every((id) => right.has(id));
}

function signInOf(
  supervisor: SupervisorReadModel,
  member: TeamMemberReadModel | null,
): SiteEngineerSignIn {
  if (supervisor.teamMemberId == null || member == null)
    return { kind: "none" };
  if (!member.siteEngineer)
    return { kind: "office_staff", memberId: member.id, name: member.name };
  return {
    kind: "site_engineer",
    memberId: member.id,
    status: member.status,
    canSetPassword: member.canSetPassword,
    invitePath: member.invitePath,
    invitedAt: member.invitedAt,
    joinedAt: member.joinedAt,
  };
}

function memberDetails(member: TeamMemberReadModel): SiteEngineerMemberDetails {
  return {
    email: member.email,
    address: member.address,
    aadhaarMasked: member.aadhaarMasked,
    panMasked: member.panMasked,
    emergencyContact: member.emergencyContact,
    salaryType: member.salaryType,
    salaryPerDay: member.salaryPerDay,
    salaryPerMonth: member.salaryPerMonth,
    overtimeWagePerHour: member.overtimeWagePerHour,
    workingHoursPerDay: member.workingHoursPerDay,
    weeklyHolidays: member.weeklyHolidays,
    projectIds: member.projectIds,
  };
}

function toReadModel(
  supervisor: SupervisorReadModel,
  member: TeamMemberReadModel | null,
): SiteEngineerReadModel {
  const signIn = signInOf(supervisor, member);
  return {
    ...supervisor,
    signIn,
    member:
      signIn.kind === "site_engineer" && member != null
        ? memberDetails(member)
        : null,
  };
}

/** 400 `SIGN_IN_REQUIRED` unless the sign-in invites or sets a password. */
function assertSignIn(
  signIn: SiteEngineerSignInInput | undefined,
): SiteEngineerSignInInput {
  if (signIn == null || (!signIn.invite && signIn.password == null))
    throw new DomainError(
      "SIGN_IN_REQUIRED",
      "A Site Engineer signs in: invite them, or set a password for them.",
    );
  return signIn;
}

/**
 * Site Engineers with a page of their own and a sign-in (ADR CM-0037). The
 * Site Engineer row (masters) holds the name, mobile, profile and bank
 * details; the sign-in membership (organization) holds the email, address,
 * Aadhaar, PAN, emergency contact, salary and Projects, and the Role,
 * always the default Site Engineer Role. Routes check the Labours menu
 * (`masters.labours`) first; giving a sign-in also needs every cell of the
 * Site Engineer Role (403 `CANNOT_GRANT`).
 *
 * The two contexts write in their own transactions. Every check that could
 * refuse the Site Engineer row runs before the sign-in is made, and a
 * failed row write removes the sign-in it just made.
 */
export class SiteEngineerHandlers {
  constructor(
    private readonly supervisors: SupervisorHandlers,
    private readonly members: TeamMemberHandlers,
    private readonly roles: RoleRepository,
    private readonly memberships: CompanyMemberships,
  ) {}

  /** The default Site Engineer Role; 409 when a Company has none. */
  private async roleId(workspaceId: string): Promise<string> {
    const role = (await this.roles.listAll(workspaceId)).find(
      (item) => item.isSeed && item.name === SITE_ENGINEER_ROLE,
    );
    if (role == null)
      throw conflict(
        "SITE_ENGINEER_ROLE_MISSING",
        "This Company has no default Site Engineer Role to sign in with.",
      );
    return role.id;
  }

  private async member(
    workspaceId: string,
    id: string | null,
  ): Promise<TeamMemberReadModel | null> {
    if (id == null) return null;
    try {
      return await this.members.get(workspaceId, id);
    } catch (error) {
      if (error instanceof DomainError && error.kind === "not_found")
        return null;
      throw error;
    }
  }

  async list(
    workspaceId: string,
    status: LookupStatusFilter = "all",
  ): Promise<SiteEngineerReadModel[]> {
    const supervisors = await this.supervisors.list(workspaceId, status);
    const ids = new Set(
      supervisors
        .map((item) => item.teamMemberId)
        .filter((id): id is string => id != null),
    );
    if (ids.size === 0)
      return supervisors.map((item) => toReadModel(item, null));
    const page = await this.members.list({
      workspaceId,
      limit: 10_000,
      includeSiteEngineers: true,
    });
    const byId = new Map(
      page.items
        .filter((member) => ids.has(member.id))
        .map((member) => [member.id, member]),
    );
    return supervisors.map((item) =>
      toReadModel(
        item,
        item.teamMemberId == null
          ? null
          : (byId.get(item.teamMemberId) ?? null),
      ),
    );
  }

  async get(workspaceId: string, id: string): Promise<SiteEngineerReadModel> {
    const supervisor = await this.supervisors.get(workspaceId, id);
    return toReadModel(
      supervisor,
      await this.member(workspaceId, supervisor.teamMemberId),
    );
  }

  /**
   * Every sign-in a Site Engineer row points at: their own, or an Office
   * Staff one linked before ADR CM-0037. A Project's Team Members leave
   * these out, so each person appears once (ADR CM-0038 §3).
   */
  async signInIds(workspaceId: string): Promise<Set<string>> {
    const supervisors = await this.supervisors.list(workspaceId);
    return new Set(
      supervisors
        .map((item) => item.teamMemberId)
        .filter((id): id is string => id != null),
    );
  }

  /** The sign-ins assigned to the Project, the Owner (on every one) left out. */
  private async assignedSignIns(
    workspaceId: string,
    projectId: string,
  ): Promise<{ assigned: Set<string>; ownerIds: Set<string> }> {
    const team = await this.members.projectTeam(workspaceId, projectId);
    return {
      assigned: new Set(
        team.filter((member) => !member.isOwner).map((member) => member.id),
      ),
      ownerIds: new Set(
        team.filter((member) => member.isOwner).map((member) => member.id),
      ),
    };
  }

  /**
   * The Site Engineers on a Project: those whose sign-in is assigned to it
   * (ADR CM-0038 §3), by name. The caller has checked the Project is
   * visible.
   */
  async onProject(
    workspaceId: string,
    projectId: string,
  ): Promise<ProjectSiteEngineer[]> {
    const [supervisors, { assigned }] = await Promise.all([
      this.supervisors.list(workspaceId),
      this.assignedSignIns(workspaceId, projectId),
    ]);
    return supervisors
      .filter(
        (item) => item.teamMemberId != null && assigned.has(item.teamMemberId),
      )
      .map(projectLine);
  }

  /**
   * Enabled Site Engineers not on the Project. Those without a sign-in come
   * back with `hasSignIn: false`: they cannot be put on a Project until
   * they get one (ADR CM-0038, question 1).
   */
  async assignableToProject(
    workspaceId: string,
    projectId: string,
  ): Promise<ProjectSiteEngineerChoice[]> {
    const [engineers, { assigned, ownerIds }] = await Promise.all([
      this.list(workspaceId, "enabled"),
      this.assignedSignIns(workspaceId, projectId),
    ]);
    return engineers.flatMap<ProjectSiteEngineerChoice>((item) => {
      if (item.signIn.kind === "none")
        return [{ ...projectLine(item), hasSignIn: false }];
      const memberId = item.signIn.memberId;
      if (assigned.has(memberId) || ownerIds.has(memberId)) return [];
      return [{ ...projectLine(item), hasSignIn: true }];
    });
  }

  /**
   * Makes `ids` (Site Engineer rows) the Site Engineers on the Project by
   * assigning their sign-ins through the Team Member handlers, so each
   * change is audited `team_member.projects_changed` and they see the
   * Project at their next request. `expectedIds` is the set the screen
   * loaded (409 `PROJECT_RESOURCES_CHANGED` when it moved). A Site Engineer
   * newly added must exist (400 `SUPERVISOR_NOT_FOUND`), be enabled (400
   * `SUPERVISOR_DISABLED`) and have a sign-in (409
   * `SITE_ENGINEER_NO_SIGN_IN`). No other sign-in is touched.
   */
  async setOnProject(input: {
    workspaceId: string;
    projectId: string;
    ids: readonly string[];
    expectedIds: readonly string[];
    by: string;
  }): Promise<void> {
    const [engineers, { assigned }] = await Promise.all([
      this.list(input.workspaceId),
      this.assignedSignIns(input.workspaceId, input.projectId),
    ]);
    const signInOfRow = (item: SiteEngineerReadModel) =>
      item.signIn.kind === "none" ? null : item.signIn.memberId;
    const byId = new Map(engineers.map((item) => [item.id, item]));
    const current = engineers.filter((item) => {
      const memberId = signInOfRow(item);
      return memberId != null && assigned.has(memberId);
    });
    const currentIds = current.map((item) => item.id);
    if (!sameSet(input.expectedIds, currentIds))
      throw conflict(
        "PROJECT_RESOURCES_CHANGED",
        "Someone else changed this Project's Resources after you opened them. Reload to see their changes.",
      );
    const wanted: string[] = [];
    for (const id of new Set(input.ids)) {
      const item = byId.get(id);
      if (item == null)
        throw new DomainError(
          "SUPERVISOR_NOT_FOUND",
          "Choose Site Engineers from the list. One of them was not found.",
          { details: { ids: [id] } },
        );
      const memberId = signInOfRow(item);
      if (currentIds.includes(id) && memberId != null) {
        wanted.push(memberId);
        continue;
      }
      if (item.disabled)
        throw new DomainError(
          "SUPERVISOR_DISABLED",
          `${item.name} is disabled, so they cannot be added to a Project.`,
          { details: { ids: [id] } },
        );
      if (memberId == null)
        throw conflict(
          "SITE_ENGINEER_NO_SIGN_IN",
          `${item.name} has no sign-in yet. Give them one on their page first.`,
          { ids: [id] },
        );
      wanted.push(memberId);
    }
    await this.members.setProjectTeam({
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      ids: wanted,
      expectedIds: current
        .map(signInOfRow)
        .filter((id): id is string => id != null),
      by: input.by,
      scope: {
        only: new Set(
          engineers.map(signInOfRow).filter((id): id is string => id != null),
        ),
      },
    });
  }

  /** A new sign-in on the Site Engineer Role, left off Office Staff. */
  private async newSignIn(input: {
    workspaceId: string;
    by: string;
    grantor: MemberAccess;
    details: SiteEngineerInput;
    signIn: SiteEngineerSignInInput;
  }) {
    const { details } = input;
    return this.members.invite({
      workspaceId: input.workspaceId,
      by: input.by,
      grantor: input.grantor,
      details: {
        name: details.name,
        mobile: details.mobile,
        email: details.email,
        address: details.address,
        aadhaar: details.aadhaar ?? null,
        pan: details.pan ?? null,
        emergencyContact: details.emergencyContact,
      },
      ...(details.salary === undefined ? {} : { salary: details.salary }),
      memberType: "normal",
      siteEngineer: true,
      projectIds: details.projectIds,
      roleId: await this.roleId(input.workspaceId),
      invite: input.signIn.invite,
      password: input.signIn.password,
    });
  }

  /** Takes a sign-in back: the record is tombstoned, the membership ends. */
  private async removeSignIn(
    workspaceId: string,
    memberId: string,
    by: string,
  ): Promise<void> {
    const { userId } = await this.members.remove({
      workspaceId,
      id: memberId,
      by,
    });
    if (userId != null)
      await this.memberships.removeMember({ workspaceId, userId });
  }

  /**
   * Add Site Engineer: the row and its sign-in. 400 `SIGN_IN_REQUIRED`
   * without an invitation or a password.
   */
  async create(input: {
    workspaceId: string;
    by: string;
    grantor: MemberAccess;
    details: SiteEngineerInput;
    signIn?: SiteEngineerSignInInput;
  }): Promise<SiteEngineerCreated> {
    const signIn = assertSignIn(input.signIn);
    const row = {
      workspaceId: input.workspaceId,
      by: input.by,
      name: input.details.name,
      mobile: input.details.mobile,
      profile: input.details.profile,
      ...(input.details.bank === undefined ? {} : { bank: input.details.bank }),
    };
    await this.supervisors.assertCanCreate(row);
    const member = await this.newSignIn({ ...input, signIn });
    let supervisor: SupervisorReadModel;
    try {
      supervisor = await this.supervisors.create({
        ...row,
        teamMemberId: member.id,
      });
    } catch (error) {
      await this.removeSignIn(input.workspaceId, member.id, input.by);
      throw error;
    }
    return {
      ...toReadModel(supervisor, member),
      passwordIgnored: member.passwordIgnored,
      passwordSet: signIn.password != null && member.passwordIgnored == null,
      invited: signIn.invite,
    };
  }

  /**
   * Edit Site Engineer. With their own sign-in, its details and Projects
   * change too. An older one without a sign-in must get one now (400
   * `SIGN_IN_REQUIRED`). One who is Office Staff keeps that record as it
   * is: only the Site Engineer row changes. 409 `SUPERVISOR_CHANGED` when
   * the row is stale.
   */
  async update(input: {
    workspaceId: string;
    id: string;
    by: string;
    grantor: MemberAccess;
    expectedUpdatedAt: Date;
    details: SiteEngineerInput;
    signIn?: SiteEngineerSignInInput;
  }): Promise<SiteEngineerReadModel> {
    const current = await this.get(input.workspaceId, input.id);
    const { details } = input;
    const row = {
      workspaceId: input.workspaceId,
      id: input.id,
      by: input.by,
      expectedUpdatedAt: input.expectedUpdatedAt,
      name: details.name,
      mobile: details.mobile,
      teamMemberId: current.teamMemberId,
      profile: details.profile,
      ...(details.bank === undefined ? {} : { bank: details.bank }),
    };
    await this.supervisors.assertCanUpdate(row);

    let teamMemberId = current.teamMemberId;
    let made: string | null = null;
    if (current.signIn.kind === "none") {
      const signIn = assertSignIn(input.signIn);
      const member = await this.newSignIn({ ...input, signIn });
      teamMemberId = member.id;
      made = member.id;
    } else if (current.signIn.kind === "site_engineer") {
      const memberId = current.signIn.memberId;
      await this.members.update({
        workspaceId: input.workspaceId,
        id: memberId,
        by: input.by,
        details: {
          name: details.name,
          mobile: details.mobile,
          email: details.email,
          address: details.address,
          ...(details.aadhaar === undefined
            ? {}
            : { aadhaar: details.aadhaar }),
          ...(details.pan === undefined ? {} : { pan: details.pan }),
          emergencyContact: details.emergencyContact,
        },
        ...(details.salary === undefined ? {} : { salary: details.salary }),
        memberType: "normal",
      });
      const before = new Set(current.member?.projectIds ?? []);
      const after = new Set(details.projectIds);
      if (
        before.size !== after.size ||
        [...after].some((projectId) => !before.has(projectId))
      )
        await this.members.assignProjects({
          workspaceId: input.workspaceId,
          id: memberId,
          by: input.by,
          projectIds: [...after],
        });
    }

    try {
      await this.supervisors.update({ ...row, teamMemberId });
    } catch (error) {
      if (made != null)
        await this.removeSignIn(input.workspaceId, made, input.by);
      throw error;
    }
    return this.get(input.workspaceId, input.id);
  }

  /** Their own sign-in, or 409 `SITE_ENGINEER_NO_SIGN_IN`. */
  private async ownSignIn(workspaceId: string, id: string): Promise<string> {
    const current = await this.get(workspaceId, id);
    if (current.signIn.kind !== "site_engineer")
      throw conflict(
        "SITE_ENGINEER_NO_SIGN_IN",
        current.signIn.kind === "office_staff"
          ? "This Site Engineer signs in as Office Staff. Manage it there."
          : "This Site Engineer has no sign-in yet. Add one on Edit.",
      );
    return current.signIn.memberId;
  }

  /** A fresh invite link, sent again. */
  async resendInvite(input: {
    workspaceId: string;
    id: string;
    by: string;
  }): Promise<SiteEngineerReadModel> {
    const memberId = await this.ownSignIn(input.workspaceId, input.id);
    await this.members.resendInvite({
      workspaceId: input.workspaceId,
      id: memberId,
      by: input.by,
    });
    return this.get(input.workspaceId, input.id);
  }

  /** A new temporary password (ADR CM-0030 §7). */
  async setPassword(input: {
    workspaceId: string;
    id: string;
    by: string;
    grantor: MemberAccess;
    password: string;
  }): Promise<SiteEngineerReadModel & { passwordIgnored: PasswordIgnored }> {
    const memberId = await this.ownSignIn(input.workspaceId, input.id);
    const result = await this.members.setPassword({
      workspaceId: input.workspaceId,
      id: memberId,
      by: input.by,
      grantor: input.grantor,
      password: input.password,
    });
    return {
      ...(await this.get(input.workspaceId, input.id)),
      passwordIgnored: result.passwordIgnored,
    };
  }

  /**
   * Deletes the Site Engineer (409 `SUPERVISOR_IN_USE` while Labours or
   * attendance name them) and then takes back their own sign-in. An Office
   * Staff member they were linked to stays.
   */
  async delete(input: {
    workspaceId: string;
    id: string;
    by: string;
  }): Promise<void> {
    const current = await this.get(input.workspaceId, input.id);
    await this.supervisors.delete(input);
    if (current.signIn.kind === "site_engineer")
      await this.removeSignIn(
        input.workspaceId,
        current.signIn.memberId,
        input.by,
      );
  }
}

export function createSiteEngineerHandlers(deps?: {
  prisma?: PrismaClient;
  members?: TeamMemberHandlers;
  memberships?: CompanyMemberships;
}): SiteEngineerHandlers {
  const db = deps?.prisma ?? prisma;
  return new SiteEngineerHandlers(
    createSupervisorHandlers({ prisma: db }),
    deps?.members ?? createTeamMemberHandlers({ prisma: db }),
    new PrismaRoleRepository(db),
    deps?.memberships ?? authCompanyMemberships,
  );
}
