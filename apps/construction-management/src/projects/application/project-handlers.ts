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
  ProjectCustomFieldLabels,
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

/**
 * A live Project the viewer may see; any other is "not found", so a
 * Member cannot tell another Project exists.
 */
export async function loadVisibleProject(
  projects: Pick<ProjectRepository, "findById">,
  viewer: ProjectViewer,
  id: string,
): Promise<Project> {
  const ids = visibleIds(viewer);
  const found =
    ids == null || ids.has(id)
      ? await projects.findById(viewer.workspaceId, id)
      : null;
  if (found == null)
    throw notFound("PROJECT_NOT_FOUND", "This Project was not found.");
  return found;
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

/** The audit row's before/after; plain JSON (amounts are numbers). */
export function projectSnapshot(project: Project) {
  return {
    ...project.details,
    ...project.contract,
    ...project.profile,
    customFields: project.customFields.map(({ label, value }) => ({
      label,
      value,
    })),
  };
}

/** The label picker shows at most this many (CM-413). */
export const CUSTOM_FIELD_LABELS_LIMIT = 50;

/**
 * Without the Project menu's Financial flag the order value and the
 * budget are not the caller's to set: dropped, so a new Project has none
 * and an edit keeps the stored ones.
 */
function withoutAmounts(
  details: ProjectDetailsInput,
  financial: boolean,
): ProjectDetailsInput {
  if (financial) return details;
  const {
    orderValue: _orderValue,
    budgetValue: _budgetValue,
    ...rest
  } = details;
  return rest;
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
    private readonly labels: ProjectCustomFieldLabels,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  private load(viewer: ProjectViewer, id: string): Promise<Project> {
    return loadVisibleProject(this.projects, viewer, id);
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
      after: project.deletedAt == null ? projectSnapshot(project) : undefined,
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

  /**
   * Custom-field labels already used on the Company's live Projects, for
   * the label picker; every Project, not only the viewer's, so the
   * Company's names stay consistent.
   */
  async customFieldLabels(viewer: ProjectViewer): Promise<string[]> {
    return this.labels.list(viewer.workspaceId, CUSTOM_FIELD_LABELS_LIMIT);
  }

  /**
   * New Project with its seed drawing albums and testing items; 400
   * `PROJECT_TYPE_REQUIRED` without a type, 402 `PLAN_LIMIT_EXCEEDED`
   * beyond the plan (CM-118). `financial`: whether the caller may set the
   * order value and the budget.
   */
  async create(input: {
    workspaceId: string;
    by: string;
    details: ProjectDetailsInput;
    financial: boolean;
  }): Promise<ProjectReadModel> {
    const now = this.clock();
    const project = Project.create({
      id: newId(now.getTime()),
      workspaceId: input.workspaceId,
      details: withoutAmounts(input.details, input.financial),
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

  /**
   * Edit Project; 409 `PROJECT_CHANGED` when someone saved in between.
   * Without `financial` the stored order value and budget stay as they are.
   */
  async update(input: {
    viewer: ProjectViewer;
    id: string;
    by: string;
    details: ProjectDetailsInput;
    financial: boolean;
    expectedUpdatedAt: Date;
  }): Promise<ProjectReadModel> {
    const project = await this.load(input.viewer, input.id);
    const before = projectSnapshot(project);
    project.update(
      withoutAmounts(input.details, input.financial),
      input.by,
      this.clock(),
    );
    await this.projects.update(
      project,
      input.expectedUpdatedAt,
      this.audit(project, input.by, "project.updated", before),
    );
    return toProjectReadModel(project);
  }

  /**
   * Tombstone; 409 `PROJECT_IN_USE` while site records, documents, Wings,
   * Locations, drawings or testing reports point at it.
   */
  async delete(input: {
    viewer: ProjectViewer;
    id: string;
    by: string;
  }): Promise<void> {
    const project = await this.load(input.viewer, input.id);
    if (await this.usage.isInUse(project.workspaceId, project.id))
      throw conflict(
        "PROJECT_IN_USE",
        "Labours, vendors, attendance, payments, documents, Wings, Locations, drawings or testing reports are recorded on this Project, so it cannot be deleted. Mark it Completed instead.",
      );
    const before = projectSnapshot(project);
    project.delete(input.by, this.clock());
    await this.projects.delete(
      project,
      this.audit(project, input.by, "project.deleted", before),
    );
  }
}
