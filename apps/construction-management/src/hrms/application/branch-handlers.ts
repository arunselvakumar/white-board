import { assertCan, type MemberAccess } from "@/src/shared-kernel/access";
import { DomainError, notFound } from "@/src/shared-kernel/domain-error";

import {
  createBranch,
  type BranchDetails,
  type BranchInput,
  type Fence,
} from "../domain/branch";
import { MemberFences, type MemberFenceSource } from "./member-fences";
import type {
  EmployeeDirectory,
  HrmsEmployee,
  HrmsProject,
  ProjectDirectory,
} from "./ports";

/** A live branch or project-site fence, with its member links. */
export type StoredBranch = BranchDetails & {
  id: string;
  /** Members linked to this office branch; empty for a project site. */
  memberIds: readonly string[];
  createdAt: Date;
  updatedAt: Date;
};

export type BranchStore = MemberFenceSource & {
  /** Live branches and site fences, office branches first, then by name. */
  list(workspaceId: string): Promise<StoredBranch[]>;
  find(workspaceId: string, id: string): Promise<StoredBranch | null>;
  /**
   * Adds a branch, audited. 409 `BRANCH_NAME_TAKEN` for a live office
   * branch of the same name, `PROJECT_SITE_TAKEN` when the Project already
   * has a live site fence.
   */
  create(input: {
    workspaceId: string;
    branch: BranchDetails;
    by: string;
    now: Date;
  }): Promise<StoredBranch>;
  /**
   * Replaces a branch's details, audited. 404 `BRANCH_NOT_FOUND`, 409
   * `BRANCH_CHANGED` when `updatedAt` is not `expectedUpdatedAt`, and the
   * conflicts of `create`.
   */
  update(input: {
    workspaceId: string;
    id: string;
    branch: BranchDetails;
    expectedUpdatedAt: Date;
    by: string;
    now: Date;
  }): Promise<StoredBranch>;
  /** Soft-deletes a branch and drops its member links, audited. 404 when gone. */
  remove(input: {
    workspaceId: string;
    id: string;
    by: string;
    now: Date;
  }): Promise<void>;
  /**
   * Replaces the members linked to an office branch, audited; bumps the
   * branch's `updatedAt` (409 `BRANCH_CHANGED` as `update`).
   */
  setMembers(input: {
    workspaceId: string;
    id: string;
    memberIds: readonly string[];
    expectedUpdatedAt: Date;
    by: string;
    now: Date;
  }): Promise<StoredBranch>;
};

export type BranchView = StoredBranch & { projectName: string | null };

export type ProjectSite = {
  project: HrmsProject;
  /** The Project's site fence, or null when it has none yet. */
  fence: BranchView | null;
};

function projectNotFound(): DomainError {
  return new DomainError(
    "BRANCH_PROJECT_NOT_FOUND",
    "That Project does not exist. Choose another.",
    { details: { field: "projectId" } },
  );
}

/**
 * Branches & Sites (CM-304): office branches and Project site fences, the
 * members who check in at each office branch, and the fences that apply
 * to the signed-in member (`myFences`). Menu `hrms.settings`; `myFences`
 * needs `hrms.attendance` read, as check-in does.
 */
export class BranchHandlers {
  readonly fences: MemberFences;

  constructor(
    private readonly store: BranchStore,
    private readonly projects: ProjectDirectory,
    private readonly employees: EmployeeDirectory,
    private readonly clock: () => Date = () => new Date(),
  ) {
    this.fences = new MemberFences(store, employees);
  }

  private async view(
    workspaceId: string,
    branches: StoredBranch[],
  ): Promise<BranchView[]> {
    const ids = branches.flatMap((branch) =>
      branch.projectId == null ? [] : [branch.projectId],
    );
    const projects = await this.projects.find(workspaceId, ids);
    return branches.map((branch) => ({
      ...branch,
      projectName:
        branch.projectId == null
          ? null
          : (projects.get(branch.projectId)?.name ?? null),
    }));
  }

  /** Every branch and site fence, and the Team Members that can be linked. */
  async list(input: {
    access: MemberAccess;
  }): Promise<{ branches: BranchView[]; employees: HrmsEmployee[] }> {
    assertCan(input.access, "hrms.settings", "read");
    const { workspaceId } = input.access;
    const [branches, employees] = await Promise.all([
      this.store.list(workspaceId),
      this.employees.list(workspaceId),
    ]);
    return { branches: await this.view(workspaceId, branches), employees };
  }

  /** Every live Project with its site fence (or none), for the site picker. */
  async projectSites(input: { access: MemberAccess }): Promise<ProjectSite[]> {
    assertCan(input.access, "hrms.settings", "read");
    const { workspaceId } = input.access;
    const [projects, branches] = await Promise.all([
      this.projects.list(workspaceId),
      this.store.list(workspaceId),
    ]);
    const byProject = new Map(
      branches
        .filter((branch) => branch.projectId != null)
        .map((branch) => [branch.projectId, branch]),
    );
    return projects.map((project) => {
      const fence = byProject.get(project.id);
      return {
        project,
        fence: fence == null ? null : { ...fence, projectName: project.name },
      };
    });
  }

  private async assertProject(
    workspaceId: string,
    branch: BranchDetails,
  ): Promise<void> {
    if (branch.projectId == null) return;
    const found = await this.projects.find(workspaceId, [branch.projectId]);
    if (!found.has(branch.projectId)) throw projectNotFound();
  }

  /** Adds an office branch or a Project's site fence. */
  async create(input: {
    access: MemberAccess;
    branch: BranchInput;
  }): Promise<BranchView> {
    assertCan(input.access, "hrms.settings", "create");
    const { workspaceId, userId } = input.access;
    const branch = createBranch(input.branch);
    await this.assertProject(workspaceId, branch);
    const created = await this.store.create({
      workspaceId,
      branch,
      by: userId,
      now: this.clock(),
    });
    const [view] = await this.view(workspaceId, [created]);
    return view ?? { ...created, projectName: null };
  }

  private async existing(
    workspaceId: string,
    id: string,
  ): Promise<StoredBranch> {
    const found = await this.store.find(workspaceId, id);
    if (found == null)
      throw notFound("BRANCH_NOT_FOUND", "This branch or site was removed.");
    return found;
  }

  /** Edits a branch or site fence; its kind never changes. */
  async update(input: {
    access: MemberAccess;
    id: string;
    branch: Omit<BranchInput, "kind">;
    expectedUpdatedAt: Date;
  }): Promise<BranchView> {
    assertCan(input.access, "hrms.settings", "update");
    const { workspaceId, userId } = input.access;
    const stored = await this.existing(workspaceId, input.id);
    const branch = createBranch({ ...input.branch, kind: stored.kind });
    await this.assertProject(workspaceId, branch);
    const updated = await this.store.update({
      workspaceId,
      id: input.id,
      branch,
      expectedUpdatedAt: input.expectedUpdatedAt,
      by: userId,
      now: this.clock(),
    });
    const [view] = await this.view(workspaceId, [updated]);
    return view ?? { ...updated, projectName: null };
  }

  /** Removes a fence; members linked to it are unlinked. */
  async remove(input: { access: MemberAccess; id: string }): Promise<void> {
    assertCan(input.access, "hrms.settings", "delete");
    await this.store.remove({
      workspaceId: input.access.workspaceId,
      id: input.id,
      by: input.access.userId,
      now: this.clock(),
    });
  }

  /**
   * "Members who check in here": replaces the Team Members linked to an
   * office branch (ADR CM-0012 §4). A member linked to no branch may check
   * in at any office branch.
   */
  async setMembers(input: {
    access: MemberAccess;
    id: string;
    memberIds: readonly string[];
    expectedUpdatedAt: Date;
  }): Promise<BranchView> {
    assertCan(input.access, "hrms.settings", "update");
    const { workspaceId, userId } = input.access;
    const stored = await this.existing(workspaceId, input.id);
    if (stored.kind !== "office_branch")
      throw new DomainError(
        "BRANCH_MEMBERS_OFFICE_ONLY",
        "Members are linked to office branches. A site fence applies to everyone on its Project.",
        { details: { field: "memberIds" } },
      );
    const memberIds = [...new Set(input.memberIds)];
    const found = await this.employees.find(workspaceId, memberIds);
    if (memberIds.some((id) => !found.has(id)))
      throw new DomainError(
        "BRANCH_MEMBER_NOT_FOUND",
        "A chosen Team Member was removed. Reload and choose again.",
        { details: { field: "memberIds" } },
      );
    const updated = await this.store.setMembers({
      workspaceId,
      id: input.id,
      memberIds,
      expectedUpdatedAt: input.expectedUpdatedAt,
      by: userId,
      now: this.clock(),
    });
    return { ...updated, projectName: null };
  }

  /**
   * The fences that apply to the signed-in member (`my-fences`, ADR
   * CM-0012 §4). 404 `TEAM_MEMBER_NOT_FOUND` when the User has no Team
   * Member in the Company.
   */
  async myFences(input: {
    access: MemberAccess;
  }): Promise<{ memberId: string; fences: Fence[] }> {
    assertCan(input.access, "hrms.attendance", "read");
    const { workspaceId, userId } = input.access;
    const member = await this.employees.findByUserId(workspaceId, userId);
    if (member == null)
      throw notFound(
        "TEAM_MEMBER_NOT_FOUND",
        "You are not a Team Member of this Company.",
      );
    return {
      memberId: member.memberId,
      fences: await this.fences.fencesFor(workspaceId, member.memberId),
    };
  }
}
