import { prisma, type PrismaClient } from "@repo/construction-db";

import { createLabourHandlers } from "@/src/labour/infrastructure/create-labour-handlers";
import { createVendorHandlers } from "@/src/labour/infrastructure/create-vendor-handlers";
import { createPartyHandlers } from "@/src/masters/infrastructure/create-party-handlers";
import { createTeamMemberHandlers } from "@/src/organization/infrastructure/create-team-member-handlers";
import {
  loadVisibleProject,
  type ProjectViewer,
} from "@/src/projects/application/project-handlers";
import { PrismaProjectRepository } from "@/src/projects/infrastructure/prisma-project-repository";

import {
  createSiteEngineerHandlers,
  type ProjectSiteEngineer,
  type ProjectSiteEngineerChoice,
} from "./site-engineers";

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
  /** Role, Departments, contact person or mobile. */
  detail: string | null;
  /** Inactive parties stay on the Project but are not offered again. */
  isActive: boolean;
};

export type ProjectTeamMemberResource = ProjectResource & {
  /** The Owner is on every Project and cannot be taken off. */
  isOwner: boolean;
};

export type ProjectResources = {
  /** Their sign-ins are left out of `teamMembers` (ADR CM-0038 §3). */
  siteEngineers: ProjectSiteEngineer[];
  /** How many; the list is paged on its own route (ADR CM-0038 §2). */
  labours: { total: number };
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

/** Site Engineers (masters and organization) and Labours (labour) on a Project. */
export type StaffingSides = {
  siteEngineers: {
    onProject(
      workspaceId: string,
      projectId: string,
    ): Promise<ProjectSiteEngineer[]>;
    assignable(
      workspaceId: string,
      projectId: string,
    ): Promise<ProjectSiteEngineerChoice[]>;
    setOnProject(input: {
      workspaceId: string;
      projectId: string;
      ids: readonly string[];
      expectedIds: readonly string[];
      by: string;
    }): Promise<void>;
  };
  labourCount(workspaceId: string, projectId: string): Promise<number>;
};

/**
 * A Project's Resources (CM-406): where the organization (Team Members),
 * masters (Contractors, Suppliers, Site Engineers with their sign-ins) and
 * labour (Vendors, Labours) contexts meet a Project. Each party keeps its Projects in its own context, so every
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
    const [
      siteEngineers,
      labours,
      teamMembers,
      contractors,
      suppliers,
      vendors,
    ] = await Promise.all([
      this.staffing.siteEngineers.onProject(workspaceId, projectId),
      this.staffing.labourCount(workspaceId, projectId),
      this.sides.team_members.onProject(workspaceId, projectId),
      this.sides.contractors.onProject(workspaceId, projectId),
      this.sides.suppliers.onProject(workspaceId, projectId),
      this.sides.vendors.onProject(workspaceId, projectId),
    ]);
    return {
      siteEngineers,
      labours: { total: labours },
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

  /** Site Engineers the Add Site Engineers picker lists (ADR CM-0038 §3). */
  async assignableSiteEngineers(
    viewer: ProjectViewer,
    projectId: string,
  ): Promise<ProjectSiteEngineerChoice[]> {
    await this.assertVisible(viewer, projectId);
    return this.staffing.siteEngineers.assignable(
      viewer.workspaceId,
      projectId,
    );
  }

  /** Makes `ids` (Site Engineer rows) the Site Engineers on the Project. */
  async setSiteEngineers(
    viewer: ProjectViewer,
    projectId: string,
    input: { ids: readonly string[]; expectedIds: readonly string[] },
  ): Promise<ProjectResources> {
    await this.assertVisible(viewer, projectId);
    await this.staffing.siteEngineers.setOnProject({
      workspaceId: viewer.workspaceId,
      projectId,
      ids: input.ids,
      expectedIds: input.expectedIds,
      by: viewer.userId,
    });
    return this.get(viewer, projectId);
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
  const siteEngineers = createSiteEngineerHandlers({
    prisma: db,
    members: teamMembers,
  });
  const vendors = createVendorHandlers({ prisma: db });
  const labours = createLabourHandlers({ prisma: db }).labours;
  // Each person appears once: a Site Engineer's sign-in is listed, added
  // and removed only in the Site Engineers section (ADR CM-0038 §3).
  const notSiteEngineers = async <
    Line extends { id: string; isOwner: boolean },
  >(
    workspaceId: string,
    lines: Promise<Line[]>,
  ) => {
    const [signIns, items] = await Promise.all([
      siteEngineers.signInIds(workspaceId),
      lines,
    ]);
    return items.filter((line) => line.isOwner || !signIns.has(line.id));
  };
  return new ProjectResourcesService(
    async (viewer, projectId) => {
      await loadVisibleProject(projects, viewer, projectId);
    },
    {
      team_members: {
        onProject: (workspaceId, projectId) =>
          notSiteEngineers(
            workspaceId,
            teamMembers.projectTeam(workspaceId, projectId),
          ),
        assignable: (workspaceId) =>
          notSiteEngineers(
            workspaceId,
            teamMembers.assignableToProjects(workspaceId),
          ),
        setOnProject: async (input) => {
          await teamMembers.setProjectTeam({
            ...input,
            scope: {
              except: await siteEngineers.signInIds(input.workspaceId),
            },
          });
        },
      },
      contractors: createPartyHandlers("contractor", { prisma: db }),
      suppliers: createPartyHandlers("supplier", { prisma: db }),
      vendors,
    },
    {
      siteEngineers: {
        onProject: (workspaceId, projectId) =>
          siteEngineers.onProject(workspaceId, projectId),
        assignable: (workspaceId, projectId) =>
          siteEngineers.assignableToProject(workspaceId, projectId),
        setOnProject: (input) => siteEngineers.setOnProject(input),
      },
      labourCount: (workspaceId, projectId) =>
        labours.countOnProject(workspaceId, projectId),
    },
  );
}
