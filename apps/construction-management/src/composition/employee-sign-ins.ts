import { prisma, type PrismaClient } from "@repo/construction-db";

import type {
  CreateEmployeeInput,
  EmployeeHandlers,
  UpdateEmployeeInput,
} from "@/src/labour/application/employee-handlers";
import type { EmployeeReadModel } from "@/src/labour/application/employee-ports";
import type { Employee } from "@/src/labour/domain/employee";
import { createEmployeeHandlers } from "@/src/labour/infrastructure/create-employee-handlers";
import type { CompanyMemberships } from "@/src/organization/application/company-memberships";
import {
  mobileRequired,
  type PasswordIgnored,
  type TeamMemberHandlers,
  type TeamMemberWithPassword,
} from "@/src/organization/application/team-member-handlers";
import type { TeamMemberReadModel } from "@/src/organization/application/team-member-read-model";
import type { TeamMemberStatus } from "@/src/organization/domain/team-member";
import { authCompanyMemberships } from "@/src/organization/infrastructure/auth-company-memberships";
import { createTeamMemberHandlers } from "@/src/organization/infrastructure/create-team-member-handlers";
import type { MemberAccess } from "@/src/shared-kernel/access";
import { DomainError, conflict } from "@/src/shared-kernel/domain-error";

/**
 * An Employee's sign-in (ADR CM-0055 §4): a membership on their Role,
 * marked `employee` and left off Office Staff. They sign in with their
 * mobile and the password set for them (ADR CM-0053).
 */
export type EmployeeSignIn = {
  memberId: string;
  status: TeamMemberStatus;
  /** Set password may be used (ADR CM-0030 §7). */
  canSetPassword: boolean;
  /** Their User also works with another Company: the mobile stays. */
  mobileLocked: boolean;
  invitedAt: Date | null;
  joinedAt: Date | null;
};

export type EmployeeWithSignIn = EmployeeReadModel & {
  /** Null when they do not sign in. */
  signIn: EmployeeSignIn | null;
};

/**
 * "Can sign in" and, to turn it on, a first password. Left out on Edit
 * keeps the sign-in as it is; the password is only read when a sign-in is
 * made (Set password changes it later).
 */
export type EmployeeSignInInput = {
  canSignIn: boolean;
  password?: string | null;
};

export type EmployeeCreated = EmployeeWithSignIn & {
  /** `existing_account`: they got a Join Request; the password was not set. */
  passwordIgnored: PasswordIgnored;
  passwordSet: boolean;
};

/** 400 `PASSWORD_REQUIRED` on the Password field. */
function passwordRequired(): DomainError {
  return new DomainError(
    "PASSWORD_REQUIRED",
    "An Employee who can sign in needs a first password: set one for them.",
    { details: { field: "password" } },
  );
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  const left = new Set(a);
  const right = new Set(b);
  return left.size === right.size && [...left].every((id) => right.has(id));
}

function signInOf(member: TeamMemberReadModel): EmployeeSignIn {
  return {
    memberId: member.id,
    status: member.status,
    canSetPassword: member.canSetPassword,
    mobileLocked: member.userId != null && member.inOtherCompany,
    invitedAt: member.invitedAt,
    joinedAt: member.joinedAt,
  };
}

/** What a command made, kept outside the hook so a failure can undo it. */
type Made = { member: TeamMemberWithPassword | null };

/**
 * Employees and their optional sign-in (ADR CM-0055 §4). The labour
 * context holds the Employee; the organization context the membership,
 * which follows the Employee: their Role, name, mobile and email, and
 * their Projects (`employee_projects`), so they see what they work on.
 * Turning "Can sign in" off, or deleting the Employee, removes it.
 *
 * The two contexts write in their own transactions. The membership is made
 * or changed after every check of the Employee has passed and before the
 * Employee is written; a failed Employee write removes a membership it had
 * just made. Routes check the Employees menu (`masters.labours`) first;
 * making a sign-in or changing its Role also needs every cell of the Role
 * (403 `CANNOT_GRANT`).
 */
export class EmployeeSignInHandlers {
  constructor(
    readonly employees: EmployeeHandlers,
    private readonly members: TeamMemberHandlers,
    private readonly memberships: CompanyMemberships,
  ) {}

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

  /** The Employee with how they sign in. */
  async withSignIn(
    workspaceId: string,
    item: EmployeeReadModel,
  ): Promise<EmployeeWithSignIn> {
    const member = await this.member(workspaceId, item.teamMemberId);
    return { ...item, signIn: member == null ? null : signInOf(member) };
  }

  /** Many Employees with how each signs in, in one read of the members. */
  async withSignIns(
    workspaceId: string,
    items: readonly EmployeeReadModel[],
  ): Promise<EmployeeWithSignIn[]> {
    const ids = new Set(
      items.flatMap((item) =>
        item.teamMemberId == null ? [] : [item.teamMemberId],
      ),
    );
    if (ids.size === 0) return items.map((item) => ({ ...item, signIn: null }));
    const page = await this.members.list({
      workspaceId,
      limit: 10_000,
      includeEmployees: true,
    });
    const byId = new Map(
      page.items
        .filter((member) => ids.has(member.id))
        .map((member) => [member.id, signInOf(member)]),
    );
    return items.map((item) => ({
      ...item,
      signIn:
        item.teamMemberId == null
          ? null
          : (byId.get(item.teamMemberId) ?? null),
    }));
  }

  async get(workspaceId: string, id: string): Promise<EmployeeWithSignIn> {
    return this.withSignIn(
      workspaceId,
      await this.employees.get(workspaceId, id),
    );
  }

  /**
   * A new membership on the Employee's Role and Projects; recorded on the
   * Employee and in `made`.
   */
  private async newSignIn(input: {
    workspaceId: string;
    by: string;
    grantor: MemberAccess;
    employee: Employee;
    password: string;
    made: Made;
  }): Promise<void> {
    const { employee } = input;
    const { details } = employee;
    if (details.mobile == null) throw mobileRequired();
    input.made.member = await this.members.invite({
      workspaceId: input.workspaceId,
      by: input.by,
      grantor: input.grantor,
      details: {
        name: details.name,
        mobile: details.mobile,
        email: details.email,
      },
      memberType: "normal",
      employee: true,
      projectIds: [...employee.projectIds],
      roleId: details.roleId,
      invite: false,
      password: input.password,
    });
    employee.setSignIn(input.made.member.id, input.by, employee.updatedAt);
  }

  /** Takes a sign-in back: the record is tombstoned, the membership ends. */
  private async removeSignIn(
    workspaceId: string,
    memberId: string,
    by: string,
  ): Promise<void> {
    let userId: string | null;
    try {
      ({ userId } = await this.members.remove({
        workspaceId,
        id: memberId,
        by,
      }));
    } catch (error) {
      if (error instanceof DomainError && error.kind === "not_found") return;
      throw error;
    }
    if (userId != null)
      await this.memberships.removeMember({ workspaceId, userId });
  }

  /**
   * Add Employee. With "Can sign in", 400 `MOBILE_REQUIRED` without a
   * mobile and `PASSWORD_REQUIRED` without a password; someone who already
   * signs in with that mobile gets a Join Request instead
   * (`passwordIgnored`).
   */
  async create(input: {
    workspaceId: string;
    by: string;
    grantor: MemberAccess;
    employee: CreateEmployeeInput;
    signIn?: EmployeeSignInInput;
  }): Promise<EmployeeCreated> {
    const password = input.signIn?.password ?? null;
    if (input.signIn?.canSignIn === true && password == null)
      throw passwordRequired();
    const made: Made = { member: null };
    let created: EmployeeReadModel;
    try {
      created = await this.employees.create({
        workspaceId: input.workspaceId,
        employee: input.employee,
        by: input.by,
        beforeWrite:
          input.signIn?.canSignIn !== true || password == null
            ? undefined
            : (employee) =>
                this.newSignIn({ ...input, employee, password, made }),
      });
    } catch (error) {
      if (made.member != null)
        await this.removeSignIn(input.workspaceId, made.member.id, input.by);
      throw error;
    }
    const { member } = made;
    return {
      ...created,
      signIn: member == null ? null : signInOf(member),
      passwordIgnored: member?.passwordIgnored ?? null,
      passwordSet: member != null && member.passwordIgnored == null,
    };
  }

  /**
   * Edit Employee. "Can sign in" turned on makes a sign-in (as on Add);
   * left on, the sign-in takes the new Role, name, mobile and email (a new
   * mobile moves it, 409 `MOBILE_IN_USE` / `MOBILE_LOCKED`, ADR CM-0053
   * §3) and the Employee's Projects; turned off, it is removed. 409
   * `EMPLOYEE_CHANGED` when the Employee is stale.
   */
  async update(input: {
    workspaceId: string;
    id: string;
    by: string;
    grantor: MemberAccess;
    employee: UpdateEmployeeInput;
    signIn?: EmployeeSignInInput;
  }): Promise<EmployeeWithSignIn & { passwordIgnored: PasswordIgnored }> {
    const current = await this.employees.get(input.workspaceId, input.id);
    const had =
      (await this.member(input.workspaceId, current.teamMemberId))?.id ?? null;
    const wants = input.signIn?.canSignIn ?? current.teamMemberId != null;
    const password = input.signIn?.password ?? null;
    if (wants && had == null && password == null) throw passwordRequired();
    const made: Made = { member: null };
    let updated: EmployeeReadModel;
    try {
      updated = await this.employees.update({
        workspaceId: input.workspaceId,
        id: input.id,
        employee: input.employee,
        by: input.by,
        beforeWrite: async (employee) => {
          if (wants && had == null && password != null)
            await this.newSignIn({ ...input, employee, password, made });
          else if (wants && had != null)
            await this.follow(input, had, current.details.roleId, employee);
          // Turned off, or a membership already gone: cleared.
          else if (employee.teamMemberId != null)
            employee.setSignIn(null, input.by, employee.updatedAt);
        },
      });
    } catch (error) {
      if (made.member != null)
        await this.removeSignIn(input.workspaceId, made.member.id, input.by);
      throw error;
    }
    if (!wants && had != null)
      await this.removeSignIn(input.workspaceId, had, input.by);
    if (wants && had != null)
      await this.syncProjects(input.workspaceId, [updated], input.by);
    return {
      ...(await this.withSignIn(input.workspaceId, updated)),
      passwordIgnored: made.member?.passwordIgnored ?? null,
    };
  }

  /** The sign-in takes the Employee's Role, name, mobile and email. */
  private async follow(
    input: { workspaceId: string; by: string; grantor: MemberAccess },
    memberId: string,
    roleBefore: string,
    employee: Employee,
  ): Promise<void> {
    const { details } = employee;
    if (details.mobile == null) throw mobileRequired();
    if (details.roleId !== roleBefore)
      await this.members.setRole({
        workspaceId: input.workspaceId,
        id: memberId,
        by: input.by,
        grantor: input.grantor,
        roleId: details.roleId,
      });
    await this.members.update({
      workspaceId: input.workspaceId,
      id: memberId,
      by: input.by,
      details: {
        name: details.name,
        mobile: details.mobile,
        email: details.email,
      },
      memberType: "normal",
    });
  }

  /**
   * Gives the sign-ins of these Employees their Projects (ADR CM-0055 §4),
   * after Edit, a transfer or a change on a Project's Teams. Each change
   * is audited `team_member.projects_changed`.
   */
  async syncProjects(
    workspaceId: string,
    employees: readonly Pick<EmployeeReadModel, "teamMemberId" | "projects">[],
    by: string,
  ): Promise<void> {
    for (const employee of employees) {
      const member = await this.member(workspaceId, employee.teamMemberId);
      if (member == null) continue;
      const projectIds = employee.projects.map((project) => project.id);
      if (sameSet(member.projectIds, projectIds)) continue;
      await this.members.assignProjects({
        workspaceId,
        id: member.id,
        by,
        projectIds,
      });
    }
  }

  /** The same, by Employee id, with their Projects as they are now. */
  async syncProjectsOf(
    workspaceId: string,
    employeeIds: readonly string[],
    by: string,
  ): Promise<void> {
    const employees = await Promise.all(
      [...new Set(employeeIds)].map((id) =>
        this.employees.get(workspaceId, id),
      ),
    );
    await this.syncProjects(workspaceId, employees, by);
  }

  /** Transfer (CM-206); the sign-ins then follow the new Projects. */
  async transfer(
    input: Parameters<EmployeeHandlers["transfer"]>[0],
  ): Promise<EmployeeWithSignIn[]> {
    const moved = await this.employees.transfer(input);
    await this.syncProjects(input.workspaceId, moved, input.by);
    return this.withSignIns(input.workspaceId, moved);
  }

  /**
   * A new temporary password (ADR CM-0030 §7); 409 `EMPLOYEE_NO_SIGN_IN`
   * for an Employee who does not sign in.
   */
  async setPassword(input: {
    workspaceId: string;
    id: string;
    by: string;
    grantor: MemberAccess;
    password: string;
  }): Promise<EmployeeWithSignIn & { passwordIgnored: PasswordIgnored }> {
    const current = await this.get(input.workspaceId, input.id);
    if (current.signIn == null)
      throw conflict(
        "EMPLOYEE_NO_SIGN_IN",
        "This Employee does not sign in. Turn on Can sign in on Edit first.",
      );
    const result = await this.members.setPassword({
      workspaceId: input.workspaceId,
      id: current.signIn.memberId,
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
   * Deletes the Employee (409 `EMPLOYEE_HAS_RECORDS` while they have
   * attendance or payments) and then takes back their sign-in.
   */
  async delete(input: {
    workspaceId: string;
    id: string;
    by: string;
  }): Promise<void> {
    const { teamMemberId } = await this.employees.delete(input);
    if (teamMemberId != null)
      await this.removeSignIn(input.workspaceId, teamMemberId, input.by);
  }
}

export function createEmployeeSignInHandlers(deps?: {
  prisma?: PrismaClient;
  employees?: EmployeeHandlers;
  members?: TeamMemberHandlers;
  memberships?: CompanyMemberships;
}): EmployeeSignInHandlers {
  const db = deps?.prisma ?? prisma;
  return new EmployeeSignInHandlers(
    deps?.employees ?? createEmployeeHandlers({ prisma: db }).employees,
    deps?.members ?? createTeamMemberHandlers({ prisma: db }),
    deps?.memberships ?? authCompanyMemberships,
  );
}
