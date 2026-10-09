import type { PrismaClient } from "@repo/construction-db";

import type {
  LabourCategoryDirectory,
  ProjectDirectory,
  SupervisorDirectory,
  TeamMemberDirectory,
} from "../application/directories";

type Db = Pick<
  PrismaClient,
  | "constructionProjectsProject"
  | "constructionMastersLabourCategory"
  | "constructionMastersSupervisor"
  | "constructionOrganizationTeamMember"
>;

function unique(ids: readonly string[]): string[] {
  return [...new Set(ids)];
}

/** Reads of other contexts' tables by id (no imports of their code). */
export class PrismaDirectories {
  constructor(private readonly db: Db) {}

  readonly projects: ProjectDirectory = {
    find: async (workspaceId, ids) => {
      if (ids.length === 0) return new Map();
      const rows = await this.db.constructionProjectsProject.findMany({
        where: { workspaceId, id: { in: unique(ids) }, deletedAt: null },
        select: { id: true, name: true },
      });
      return new Map(rows.map((row) => [row.id, row]));
    },
  };

  readonly labourCategories: LabourCategoryDirectory = {
    find: async (workspaceId, ids) => {
      if (ids.length === 0) return new Map();
      const rows = await this.db.constructionMastersLabourCategory.findMany({
        where: { workspaceId, id: { in: unique(ids) }, deletedAt: null },
        select: { id: true, name: true, disabledAt: true },
      });
      return new Map(
        rows.map((row) => [
          row.id,
          { id: row.id, name: row.name, disabled: row.disabledAt != null },
        ]),
      );
    },
  };

  readonly supervisors: SupervisorDirectory = {
    find: async (workspaceId, ids) => {
      if (ids.length === 0) return new Map();
      const rows = await this.db.constructionMastersSupervisor.findMany({
        where: { workspaceId, id: { in: unique(ids) }, deletedAt: null },
        select: { id: true, name: true, disabledAt: true },
      });
      return new Map(
        rows.map((row) => [
          row.id,
          { id: row.id, name: row.name, disabled: row.disabledAt != null },
        ]),
      );
    },
  };

  readonly teamMembers: TeamMemberDirectory = {
    find: async (workspaceId, ids) => {
      if (ids.length === 0) return new Map();
      const rows = await this.db.constructionOrganizationTeamMember.findMany({
        where: { workspaceId, id: { in: unique(ids) }, deletedAt: null },
        select: { id: true, name: true },
      });
      return new Map(rows.map((row) => [row.id, row]));
    },
  };
}
