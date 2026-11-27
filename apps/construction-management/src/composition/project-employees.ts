import { prisma, type PrismaClient } from "@repo/construction-db";

import type {
  ProjectEmployeeChoice,
  ProjectEmployeePage,
} from "@/src/labour/application/employee-ports";
import {
  loadVisibleProject,
  type ProjectViewer,
} from "@/src/projects/application/project-handlers";
import { PrismaProjectRepository } from "@/src/projects/infrastructure/prisma-project-repository";
import type { NameCursor } from "@/src/shared-kernel/list-cursor";

import {
  createEmployeeSignInHandlers,
  type EmployeeSignInHandlers,
} from "./employee-sign-ins";

/**
 * Employees on a Project, from its Teams (ADR CM-0038 §2, CM-0055 §5): the
 * projects context checks the Project is visible to the viewer (404
 * otherwise), the labour context reads and writes, and the sign-ins of
 * those who sign in follow their Projects. The Permission Matrix is
 * checked by the routes.
 */
export class ProjectEmployeesService {
  constructor(
    private readonly assertVisible: (
      viewer: ProjectViewer,
      projectId: string,
    ) => Promise<void>,
    private readonly signIns: EmployeeSignInHandlers,
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
  ): Promise<ProjectEmployeePage> {
    await this.assertVisible(viewer, projectId);
    return this.signIns.employees.onProject({
      workspaceId: viewer.workspaceId,
      projectId,
      ...filter,
    });
  }

  async options(
    viewer: ProjectViewer,
    projectId: string,
    filter: { search?: string; limit: number },
  ): Promise<{ items: ProjectEmployeeChoice[]; hasMore: boolean }> {
    await this.assertVisible(viewer, projectId);
    return this.signIns.employees.addableToProject({
      workspaceId: viewer.workspaceId,
      projectId,
      ...filter,
    });
  }

  async add(
    viewer: ProjectViewer,
    projectId: string,
    input: {
      employeeIds: readonly string[];
      from?: string | null;
      remark?: string | null;
    },
  ): Promise<void> {
    await this.assertVisible(viewer, projectId);
    await this.signIns.employees.addToProject({
      workspaceId: viewer.workspaceId,
      projectId,
      ...input,
      by: viewer.userId,
    });
    await this.signIns.syncProjectsOf(
      viewer.workspaceId,
      input.employeeIds,
      viewer.userId,
    );
  }

  async remove(
    viewer: ProjectViewer,
    projectId: string,
    employeeId: string,
    input: { lastDay?: string | null; remark?: string | null },
  ): Promise<void> {
    await this.assertVisible(viewer, projectId);
    await this.signIns.employees.removeFromProject({
      workspaceId: viewer.workspaceId,
      projectId,
      employeeId,
      ...input,
      by: viewer.userId,
    });
    await this.signIns.syncProjectsOf(
      viewer.workspaceId,
      [employeeId],
      viewer.userId,
    );
  }
}

/** The Prisma-backed composition the routes use. */
export function createProjectEmployees(deps?: {
  prisma?: PrismaClient;
}): ProjectEmployeesService {
  const db = deps?.prisma ?? prisma;
  const projects = new PrismaProjectRepository(db);
  return new ProjectEmployeesService(
    async (viewer, projectId) => {
      await loadVisibleProject(projects, viewer, projectId);
    },
    createEmployeeSignInHandlers({ prisma: db }),
  );
}
