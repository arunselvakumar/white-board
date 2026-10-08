import type { MemberAccess } from "@/src/shared-kernel/access";
import type { AuditEvent } from "@/src/shared-kernel/audit";
import { conflict, notFound } from "@/src/shared-kernel/domain-error";
import { newId } from "@/src/shared-kernel/ids";
import type { PlanGate } from "@/src/shared-kernel/plan";

import {
  Project,
  compareProjects,
  type ProjectDetailsInput,
  type ProjectStatus,
} from "../domain/project";
import type {
  ProjectRepository,
  ProjectUsage,
} from "../domain/project-repository";
import {
  toProjectReadModel,
  type ProjectOption,
  type ProjectReadModel,
  type ProjectStatusCounts,
} from "./project-read-model";

/** Who is looking: the Owner sees every Project, a Member only theirs. */
export type ProjectViewer = Pick<
  MemberAccess,
  "workspaceId" | "userId" | "role" | "projectIds"
>;

function visibleIds(viewer: ProjectViewer): ReadonlySet<string> | null {
  return viewer.role === "owner" ? null : viewer.projectIds;
}

function countByStatus(projects: readonly Project[]): ProjectStatusCounts {
  const counts: ProjectStatusCounts = {
    all: projects.length,
    ongoing: 0,
    not_started: 0,
    on_hold: 0,
    completed: 0,
  };
  for (const project of projects) counts[project.status] += 1;
  return counts;
}

function snapshot(project: Project) {
  return { ...project.details };
}

/**
 * Project commands and queries (CM-204). Routes check the Permission Matrix
 * (`projects.project`) first; these apply project visibility: a Member
 * sees, edits and deletes only the Projects they are assigned to, and any
 * other Project is "not found". Creating a Project does not assign it —
 * the Owner assigns Team Members from Masters → Team Members.
 */
export class ProjectHandlers {
  constructor(
    private readonly projects: ProjectRepository,
    private readonly plan: PlanGate,
    private readonly usage: ProjectUsage,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  private async load(viewer: ProjectViewer, id: string): Promise<Project> {
    const ids = visibleIds(viewer);
    const found =
      ids == null || ids.has(id)
        ? await this.projects.findById(viewer.workspaceId, id)
        : null;
    if (found == null)
      throw notFound("PROJECT_NOT_FOUND", "This Project was not found.");
    return found;
  }

  private audit(
    project: Project,
    by: string,
    action: string,
    before?: unknown,
  ): AuditEvent {
    return {
      workspaceId: project.workspaceId,
      actorUserId: by,
      action,
      entityType: "project",
      entityId: project.id,
      before,
      after: project.deletedAt == null ? snapshot(project) : undefined,
      occurredAt: project.updatedAt,
    };
  }

  /** Projects home: by status then name, with counts per status for the chips. */
  async list(
    viewer: ProjectViewer,
    status?: ProjectStatus,
  ): Promise<{
    items: ProjectReadModel[];
    total: number;
    counts: ProjectStatusCounts;
  }> {
    const all = (
      await this.projects.list(viewer.workspaceId, visibleIds(viewer))
    ).sort(compareProjects);
    const items = (
      status == null ? all : all.filter((item) => item.status === status)
    ).map(toProjectReadModel);
    return { items, total: items.length, counts: countByStatus(all) };
  }

  /** Projects for pickers, in the same order and visibility as the list. */
  async options(viewer: ProjectViewer): Promise<ProjectOption[]> {
    const { items } = await this.list(viewer);
    return items.map(({ id, name, status }) => ({ id, name, status }));
  }

  async get(viewer: ProjectViewer, id: string): Promise<ProjectReadModel> {
    return toProjectReadModel(await this.load(viewer, id));
  }

  /** New Project; 402 `PLAN_LIMIT_EXCEEDED` beyond the plan (CM-118). */
  async create(input: {
    workspaceId: string;
    by: string;
    details: ProjectDetailsInput;
  }): Promise<ProjectReadModel> {
    const now = this.clock();
    const project = Project.create({
      id: newId(now.getTime()),
      workspaceId: input.workspaceId,
      details: input.details,
      by: input.by,
      now,
    });
    await this.plan.assertCanAdd(input.workspaceId, "project");
    await this.projects.insert(
      project,
      this.audit(project, input.by, "project.created"),
    );
    return toProjectReadModel(project);
  }

  /** Edit Project; 409 `PROJECT_CHANGED` when someone saved in between. */
  async update(input: {
    viewer: ProjectViewer;
    id: string;
    by: string;
    details: ProjectDetailsInput;
    expectedUpdatedAt: Date;
  }): Promise<ProjectReadModel> {
    const project = await this.load(input.viewer, input.id);
    const before = snapshot(project);
    project.update(input.details, input.by, this.clock());
    await this.projects.update(
      project,
      input.expectedUpdatedAt,
      this.audit(project, input.by, "project.updated", before),
    );
    return toProjectReadModel(project);
  }

  /** Tombstone; 409 `PROJECT_IN_USE` while site records point at it. */
  async delete(input: {
    viewer: ProjectViewer;
    id: string;
    by: string;
  }): Promise<void> {
    const project = await this.load(input.viewer, input.id);
    if (await this.usage.isInUse(project.workspaceId, project.id))
      throw conflict(
        "PROJECT_IN_USE",
        "Labours, vendors, attendance or payments are recorded on this Project, so it cannot be deleted. Mark it Completed instead.",
      );
    const before = snapshot(project);
    project.delete(input.by, this.clock());
    await this.projects.delete(
      project,
      this.audit(project, input.by, "project.deleted", before),
    );
  }
}
