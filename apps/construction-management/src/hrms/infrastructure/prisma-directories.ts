import type { PrismaClient } from "@repo/construction-db";

import type {
  EmployeeDirectory,
  HrmsEmployee,
  HrmsProject,
  ProjectDirectory,
} from "../application/ports";

type Db = Pick<
  PrismaClient,
  | "constructionOrganizationTeamMember"
  | "constructionOrganizationDesignation"
  | "constructionProjectsProject"
>;

const MEMBER_SELECT = {
  id: true,
  userId: true,
  name: true,
  memberType: true,
  designationId: true,
  status: true,
  isOwner: true,
  projects: { select: { projectId: true } },
} as const;

type MemberRow = {
  id: string;
  userId: string | null;
  name: string;
  memberType: "normal" | "hrms";
  designationId: string;
  status: "joining_pending" | "active" | "rejected";
  isOwner: boolean;
  projects: { projectId: string }[];
};

/**
 * Team Members as HRMS employees, read from
 * `construction_organization.team_members` and `designations` by id. The
 * organization context is referenced by id only, so this is a plain read
 * of its tables (as the labour context's directories do). Live means not
 * removed and not rejected.
 */
export class PrismaEmployeeDirectory implements EmployeeDirectory {
  constructor(private readonly db: Db) {}

  private async toEmployees(
    workspaceId: string,
    rows: MemberRow[],
  ): Promise<HrmsEmployee[]> {
    const designationIds = [...new Set(rows.map((row) => row.designationId))];
    const designations =
      designationIds.length === 0
        ? []
        : await this.db.constructionOrganizationDesignation.findMany({
            where: { workspaceId, id: { in: designationIds } },
            select: { id: true, name: true },
          });
    const names = new Map(designations.map((item) => [item.id, item.name]));
    return rows.map((row) => ({
      memberId: row.id,
      userId: row.userId,
      name: row.name,
      memberType: row.memberType,
      designationId: row.designationId,
      designationName: names.get(row.designationId) ?? null,
      projectIds: row.projects.map((project) => project.projectId),
      active: row.status === "active",
      isOwner: row.isOwner,
    }));
  }

  async list(workspaceId: string): Promise<HrmsEmployee[]> {
    const rows = await this.db.constructionOrganizationTeamMember.findMany({
      where: { workspaceId, deletedAt: null, status: { not: "rejected" } },
      select: MEMBER_SELECT,
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });
    return this.toEmployees(workspaceId, rows);
  }

  async find(
    workspaceId: string,
    memberIds: readonly string[],
  ): Promise<Map<string, HrmsEmployee>> {
    if (memberIds.length === 0) return new Map();
    const rows = await this.db.constructionOrganizationTeamMember.findMany({
      where: {
        workspaceId,
        id: { in: [...new Set(memberIds)] },
        deletedAt: null,
        status: { not: "rejected" },
      },
      select: MEMBER_SELECT,
    });
    const employees = await this.toEmployees(workspaceId, rows);
    return new Map(employees.map((employee) => [employee.memberId, employee]));
  }

  async findByUserId(
    workspaceId: string,
    userId: string,
  ): Promise<HrmsEmployee | null> {
    const row = await this.db.constructionOrganizationTeamMember.findFirst({
      where: {
        workspaceId,
        userId,
        deletedAt: null,
        status: { not: "rejected" },
      },
      select: MEMBER_SELECT,
    });
    if (row == null) return null;
    const [employee] = await this.toEmployees(workspaceId, [row]);
    return employee ?? null;
  }
}

/** Live Projects read from `construction_projects.projects` by id. */
export class PrismaProjectDirectory implements ProjectDirectory {
  constructor(private readonly db: Db) {}

  list(workspaceId: string): Promise<HrmsProject[]> {
    return this.db.constructionProjectsProject.findMany({
      where: { workspaceId, deletedAt: null },
      select: { id: true, name: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });
  }

  async find(
    workspaceId: string,
    ids: readonly string[],
  ): Promise<Map<string, HrmsProject>> {
    if (ids.length === 0) return new Map();
    const rows = await this.db.constructionProjectsProject.findMany({
      where: { workspaceId, id: { in: [...new Set(ids)] }, deletedAt: null },
      select: { id: true, name: true },
    });
    return new Map(rows.map((row) => [row.id, row]));
  }
}
