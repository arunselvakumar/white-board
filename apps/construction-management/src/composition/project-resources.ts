import { prisma, type PrismaClient } from "@repo/construction-db";

import { createVendorHandlers } from "@/src/labour/infrastructure/create-vendor-handlers";
import { createPartyHandlers } from "@/src/masters/infrastructure/create-party-handlers";
import { createTeamMemberHandlers } from "@/src/organization/infrastructure/create-team-member-handlers";
import {
  loadVisibleProject,
  type ProjectViewer,
} from "@/src/projects/application/project-handlers";
import { PrismaProjectRepository } from "@/src/projects/infrastructure/prisma-project-repository";

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
  /** Designation, Departments, contact person or mobile. */
  detail: string | null;
  /** Inactive parties stay on the Project but are not offered again. */
  isActive: boolean;
};

export type ProjectTeamMemberResource = ProjectResource & {
  /** The Owner is on every Project and cannot be taken off. */
  isOwner: boolean;
};

export type ProjectResources = {
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

/**
 * A Project's Resources (CM-406): where the organization (Team Members),
 * masters (Contractors, Suppliers) and labour (Vendors) contexts meet a
 * Project. Each party keeps its Projects in its own context, so every
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
  ) {}

  /** 404 `PROJECT_NOT_FOUND` for another Company's Project or one the Member is not on. */
  async get(
    viewer: ProjectViewer,
    projectId: string,
  ): Promise<ProjectResources> {
    await this.assertVisible(viewer, projectId);
    const { workspaceId } = viewer;
    const [teamMembers, contractors, suppliers, vendors] = await Promise.all([
      this.sides.team_members.onProject(workspaceId, projectId),
      this.sides.contractors.onProject(workspaceId, projectId),
      this.sides.suppliers.onProject(workspaceId, projectId),
      this.sides.vendors.onProject(workspaceId, projectId),
    ]);
    return { teamMembers, contractors, suppliers, vendors };
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
  );
}
