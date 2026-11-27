import { prisma, type PrismaClient } from "@repo/construction-db";

import { createEmployeeHandlers } from "@/src/labour/infrastructure/create-employee-handlers";
import { createVendorHandlers } from "@/src/labour/infrastructure/create-vendor-handlers";
import { createPartyHandlers } from "@/src/masters/infrastructure/create-party-handlers";
import { createTeamMemberHandlers } from "@/src/organization/infrastructure/create-team-member-handlers";
import {
  loadVisibleProject,
  type ProjectViewer,
} from "@/src/projects/application/project-handlers";
import { PrismaProjectRepository } from "@/src/projects/infrastructure/prisma-project-repository";
import type { CalendarDate } from "@/src/shared-kernel/calendar-date";
import { companyToday } from "@/src/shared-kernel/company-today";

/** The four kinds of party a Project's Resources assign (ADR CM-0013 §6). */
export const RESOURCE_KINDS = [
  "team_members",
  "contractors",
  "suppliers",
  "vendors",
] as const;
export type ResourceKind = (typeof RESOURCE_KINDS)[number];

/** One party on a Project's Resources, whichever context owns it. */
export type ProjectResource = {
  id: string;
  name: string;
  /** Role, contact person or mobile. */
  detail: string | null;
  /** Inactive parties stay on the Project but are not offered again. */
  isActive: boolean;
};

export type ProjectTeamMemberResource = ProjectResource & {
  /** The Owner is on every Project and cannot be taken off. */
  isOwner: boolean;
};

export type ProjectResources = {
  /** The Company's today: what Add Employees and Remove offer as the date. */
  today: CalendarDate;
  /**
   * How many; the list is paged on its own route (ADR CM-0038 §2, CM-0055
   * §5). Their sign-ins are left out of `teamMembers`.
   */
  employees: { total: number };
  teamMembers: ProjectTeamMemberResource[];
  contractors: ProjectResource[];
  suppliers: ProjectResource[];
  vendors: ProjectResource[];
};

/** What the owning context of one party kind offers the Resources tab. */
export type ResourceSide<Line extends ProjectResource = ProjectResource> = {
  onProject(workspaceId: string, projectId: string): Promise<Line[]>;
  assignable(workspaceId: string): Promise<Line[]>;
  setOnProject(input: {
    workspaceId: string;
    projectId: string;
    ids: readonly string[];
    expectedIds: readonly string[];
    by: string;
  }): Promise<void>;
};

export type ResourceSides = {
  team_members: ResourceSide<ProjectTeamMemberResource>;
  contractors: ResourceSide;
  suppliers: ResourceSide;
  vendors: ResourceSide;
};

/** Employees (labour) on a Project, and the Company's today. */
export type StaffingSides = {
  employeeCount(workspaceId: string, projectId: string): Promise<number>;
  today(workspaceId: string): Promise<CalendarDate>;
};

/**
 * A Project's Resources (CM-406), shown as its Teams: where the
 * organization (Team Members), masters (Contractors, Suppliers) and labour
 * (Vendors, Employees) contexts meet a Project. Each party keeps its
 * Projects in its own context, so every
 * write goes through that context's application layer; this module only
 * checks the Project is visible to the viewer (projects context) first.
 * The Permission Matrix is checked by the routes.
 */
export class ProjectResourcesService {
  constructor(
    private readonly assertVisible: (
      viewer: ProjectViewer,
      projectId: string,
    ) => Promise<void>,
    private readonly sides: ResourceSides,
    private readonly staffing: StaffingSides,
  ) {}

  /** 404 `PROJECT_NOT_FOUND` for another Company's Project or one the Member is not on. */
  async get(
    viewer: ProjectViewer,
    projectId: string,
  ): Promise<ProjectResources> {
    await this.assertVisible(viewer, projectId);
    const { workspaceId } = viewer;
    const [today, employees, teamMembers, contractors, suppliers, vendors] =
      await Promise.all([
        this.staffing.today(workspaceId),
        this.staffing.employeeCount(workspaceId, projectId),
        this.sides.team_members.onProject(workspaceId, projectId),
        this.sides.contractors.onProject(workspaceId, projectId),
        this.sides.suppliers.onProject(workspaceId, projectId),
        this.sides.vendors.onProject(workspaceId, projectId),
      ]);
    return {
      today,
      employees: { total: employees },
      teamMembers,
      contractors,
      suppliers,
      vendors,
    };
  }

  /** The Company's parties of a kind a picker on this Project offers. */
  async assignable(
    viewer: ProjectViewer,
    projectId: string,
    kind: ResourceKind,
  ): Promise<ProjectResource[]> {
    await this.assertVisible(viewer, projectId);
    return this.sides[kind].assignable(viewer.workspaceId);
  }

  /** Makes `ids` the parties of a kind on the Project, through their own context. */
  async set(
    viewer: ProjectViewer,
    projectId: string,
    kind: ResourceKind,
    input: { ids: readonly string[]; expectedIds: readonly string[] },
  ): Promise<ProjectResources> {
    await this.assertVisible(viewer, projectId);
    await this.sides[kind].setOnProject({
      workspaceId: viewer.workspaceId,
      projectId,
      ids: input.ids,
      expectedIds: input.expectedIds,
      by: viewer.userId,
    });
    return this.get(viewer, projectId);
  }
}

/** The Prisma-backed composition the routes use. */
export function createProjectResources(deps?: {
  prisma?: PrismaClient;
}): ProjectResourcesService {
  const db = deps?.prisma ?? prisma;
  const projects = new PrismaProjectRepository(db);
  const teamMembers = createTeamMemberHandlers({ prisma: db });
  const vendors = createVendorHandlers({ prisma: db });
  const employees = createEmployeeHandlers({ prisma: db }).employees;
  // Employees' sign-ins are left out of the Team Members by the
  // organization context: each person appears once (ADR CM-0055 §5).
  return new ProjectResourcesService(
    async (viewer, projectId) => {
      await loadVisibleProject(projects, viewer, projectId);
    },
    {
      team_members: {
        onProject: (workspaceId, projectId) =>
          teamMembers.projectTeam(workspaceId, projectId),
        assignable: (workspaceId) =>
          teamMembers.assignableToProjects(workspaceId),
        setOnProject: (input) => teamMembers.setProjectTeam(input),
      },
      contractors: createPartyHandlers("contractor", { prisma: db }),
      suppliers: createPartyHandlers("supplier", { prisma: db }),
      vendors,
    },
    {
      employeeCount: (workspaceId, projectId) =>
        employees.countOnProject(workspaceId, projectId),
      today: (workspaceId) => companyToday(db, workspaceId),
    },
  );
}
