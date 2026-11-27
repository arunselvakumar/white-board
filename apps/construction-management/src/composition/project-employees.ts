import { prisma, type PrismaClient } from "@repo/construction-db";

import type { LabourHandlers } from "@/src/labour/application/labour-handlers";
import type {
  ProjectLabourChoice,
  ProjectLabourPage,
} from "@/src/labour/application/labour-ports";
import { createLabourHandlers } from "@/src/labour/infrastructure/create-labour-handlers";
import {
  loadVisibleProject,
  type ProjectViewer,
} from "@/src/projects/application/project-handlers";
import { PrismaProjectRepository } from "@/src/projects/infrastructure/prisma-project-repository";
import type { NameCursor } from "@/src/shared-kernel/list-cursor";

/**
 * Labours on a Project, from its Resources (ADR CM-0038 §2): the projects
 * context checks the Project is visible to the viewer (404 otherwise),
 * the labour context reads and writes. The Permission Matrix is checked
 * by the routes.
 */
export class ProjectLaboursService {
  constructor(
    private readonly assertVisible: (
      viewer: ProjectViewer,
      projectId: string,
    ) => Promise<void>,
    private readonly labours: LabourHandlers,
  ) {}

  async list(
    viewer: ProjectViewer,
    projectId: string,
    filter: {
      search?: string;
      limit: number;
      after?: NameCursor;
      before?: NameCursor;
    },
  ): Promise<ProjectLabourPage> {
    await this.assertVisible(viewer, projectId);
    return this.labours.onProject({
      workspaceId: viewer.workspaceId,
      projectId,
      ...filter,
    });
  }

  async options(
    viewer: ProjectViewer,
    projectId: string,
    filter: { search?: string; limit: number },
  ): Promise<{ items: ProjectLabourChoice[]; hasMore: boolean }> {
    await this.assertVisible(viewer, projectId);
    return this.labours.addableToProject({
      workspaceId: viewer.workspaceId,
      projectId,
      ...filter,
    });
  }

  async add(
    viewer: ProjectViewer,
    projectId: string,
    input: {
      labourIds: readonly string[];
      from?: string | null;
      remark?: string | null;
    },
  ): Promise<void> {
    await this.assertVisible(viewer, projectId);
    await this.labours.addToProject({
      workspaceId: viewer.workspaceId,
      projectId,
      ...input,
      by: viewer.userId,
    });
  }

  async remove(
    viewer: ProjectViewer,
    projectId: string,
    labourId: string,
    input: { lastDay?: string | null; remark?: string | null },
  ): Promise<void> {
    await this.assertVisible(viewer, projectId);
    await this.labours.removeFromProject({
      workspaceId: viewer.workspaceId,
      projectId,
      labourId,
      ...input,
      by: viewer.userId,
    });
  }
}

/** The Prisma-backed composition the routes use. */
export function createProjectLabours(deps?: {
  prisma?: PrismaClient;
}): ProjectLaboursService {
  const db = deps?.prisma ?? prisma;
  const projects = new PrismaProjectRepository(db);
  return new ProjectLaboursService(
    async (viewer, projectId) => {
      await loadVisibleProject(projects, viewer, projectId);
    },
    createLabourHandlers({ prisma: db }).labours,
  );
}
