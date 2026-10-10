import type { AuditEvent } from "@/src/shared-kernel/audit";
import { notFound } from "@/src/shared-kernel/domain-error";
import {
  checkImage,
  companyFileKey,
  type NewStoredFile,
  type ObjectStorage,
  type StoredObject,
} from "@/src/shared-kernel/files";
import type { PlanGate } from "@/src/shared-kernel/plan";

import type { Project } from "../domain/project";
import type { ProjectRepository } from "../domain/project-repository";
import {
  loadVisibleProject,
  projectSnapshot,
  type ProjectViewer,
} from "./project-handlers";
import {
  toProjectReadModel,
  type ProjectReadModel,
} from "./project-read-model";

const BYTES_PER_GB = 1024 ** 3;

export const projectLogoNotFound = () =>
  notFound("PROJECT_LOGO_NOT_FOUND", "This Project has no logo.");

/**
 * The Project logo (CM-401, ADR CM-0013 §2), the same way as the Company
 * logo: a PNG, JPEG or WebP of at most 2 MB, checked by its content,
 * uploaded through our route to `companies/<workspaceId>/project-logos/
 * <projectId>/…`, with a `stored_files` row written with the Project. A
 * replaced logo's file is marked deleted and removed from storage. Routes
 * check `projects.project` first; these apply project visibility.
 */
export class ProjectLogos {
  constructor(
    private readonly projects: ProjectRepository,
    private readonly storage: ObjectStorage,
    private readonly plan: PlanGate,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  private audit(
    project: Project,
    by: string,
    action: string,
    before: unknown,
  ): AuditEvent {
    return {
      workspaceId: project.workspaceId,
      actorUserId: by,
      action,
      entityType: "project",
      entityId: project.id,
      before,
      after: projectSnapshot(project),
      occurredAt: project.updatedAt,
    };
  }

  /** Best effort: a leftover object costs storage, not correctness. */
  private async discard(key: string): Promise<void> {
    try {
      await this.storage.delete(key);
    } catch (error) {
      console.error(`Could not delete ${key} from storage`, error);
    }
  }

  /** Sets or replaces the logo; 402 when the plan's storage is full. */
  async set(input: {
    viewer: ProjectViewer;
    id: string;
    by: string;
    bytes: Uint8Array;
    contentType: string | null;
  }): Promise<ProjectReadModel> {
    const project = await loadVisibleProject(
      this.projects,
      input.viewer,
      input.id,
    );
    const image = checkImage("project_logo", input.bytes, input.contentType);
    await this.plan.assertCanAdd(
      project.workspaceId,
      "storage_gb",
      image.bytes / BYTES_PER_GB,
    );
    const now = this.clock();
    const key = companyFileKey(
      project.workspaceId,
      `project-logos/${project.id}`,
      image.extension,
    );
    await this.storage.put(key, input.bytes, image.contentType);
    const file: NewStoredFile = {
      workspaceId: project.workspaceId,
      key,
      kind: "project_logo",
      contentType: image.contentType,
      bytes: image.bytes,
      createdBy: input.by,
      createdAt: now,
    };
    const loadedAt = project.updatedAt;
    const before = projectSnapshot(project);
    const replaced = project.setLogo(key, input.by, now);
    try {
      await this.projects.update(
        project,
        loadedAt,
        this.audit(project, input.by, "project.logo_changed", before),
        { added: file, removedKey: replaced },
      );
    } catch (error) {
      await this.discard(key);
      throw error;
    }
    if (replaced != null) await this.discard(replaced);
    return toProjectReadModel(project);
  }

  /** Removing a logo that is not there is not an error. */
  async remove(input: {
    viewer: ProjectViewer;
    id: string;
    by: string;
  }): Promise<ProjectReadModel> {
    const project = await loadVisibleProject(
      this.projects,
      input.viewer,
      input.id,
    );
    const loadedAt = project.updatedAt;
    const before = projectSnapshot(project);
    const removed = project.removeLogo(input.by, this.clock());
    if (removed == null) return toProjectReadModel(project);
    await this.projects.update(
      project,
      loadedAt,
      this.audit(project, input.by, "project.logo_removed", before),
      { removedKey: removed },
    );
    await this.discard(removed);
    return toProjectReadModel(project);
  }

  /** The logo's bytes for a viewer who may see the Project. */
  async read(viewer: ProjectViewer, id: string): Promise<StoredObject> {
    const project = await loadVisibleProject(this.projects, viewer, id);
    if (project.logoKey == null) throw projectLogoNotFound();
    const object = await this.storage.get(project.logoKey);
    if (object == null) throw projectLogoNotFound();
    return object;
  }
}
