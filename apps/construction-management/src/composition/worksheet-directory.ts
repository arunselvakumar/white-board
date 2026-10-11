import { Prisma } from "@repo/construction-db";

import { attendanceHeadsBetween } from "@/src/composition/attendance-heads";
import { createProjectLocations } from "@/src/composition/location-resolver";
import type {
  AttendanceHeadcounts,
  WorksheetContractorFacts,
  WorksheetDirectory,
  WorksheetNamedFacts,
} from "@/src/site-work/application/ports";

const projectLocations = createProjectLocations();

const live = (workspaceId: string, ids: readonly string[]) => ({
  workspaceId,
  id: { in: [...ids] },
  deletedAt: null,
});

function byId<T extends { id: string }>(rows: readonly T[]): Map<string, T> {
  return new Map(rows.map((row) => [row.id, row]));
}

const contractorInclude = {
  projects: { select: { projectId: true } },
  departments: { select: { departmentId: true } },
} satisfies Prisma.ConstructionMastersContractorInclude;

function contractorFacts(
  row: Prisma.ConstructionMastersContractorGetPayload<{
    include: typeof contractorInclude;
  }>,
): WorksheetContractorFacts {
  return {
    id: row.id,
    name: row.name,
    isActive: row.isActive,
    projectIds: row.projects.map((project) => project.projectId),
    departmentIds: row.departments.map((department) => department.departmentId),
  };
}

/**
 * What Daily Worksheets read from masters (Contractors, Departments, Work
 * Types, Materials, Measurement Units), projects and organization (Team
 * Member names), by table (ADR CM-0001, CM-0016 §7). Site-work only sees
 * the `WorksheetDirectory` port.
 */
export const worksheetDirectory: WorksheetDirectory = {
  async projectName(db, workspaceId, projectId) {
    const row = await db.constructionProjectsProject.findFirst({
      where: { workspaceId, id: projectId, deletedAt: null },
      select: { name: true },
    });
    return row?.name ?? null;
  },

  async hasPlaces(workspaceId, projectId) {
    const options = await projectLocations.options(workspaceId, projectId);
    return options.types.length > 0;
  },

  async contractorsOnProject(db, workspaceId, projectId) {
    const rows = await db.constructionMastersContractor.findMany({
      where: {
        workspaceId,
        deletedAt: null,
        projects: { some: { projectId } },
      },
      include: contractorInclude,
      orderBy: { name: "asc" },
    });
    return rows.map(contractorFacts);
  },

  async contractors(db, workspaceId, ids) {
    if (ids.length === 0) return new Map();
    const rows = await db.constructionMastersContractor.findMany({
      where: live(workspaceId, ids),
      include: contractorInclude,
    });
    return byId(rows.map(contractorFacts));
  },

  async departments(db, workspaceId, ids) {
    if (ids.length === 0) return new Map();
    const rows = await db.constructionMastersDepartment.findMany({
      where: live(workspaceId, ids),
      select: { id: true, name: true, disabledAt: true },
    });
    return byId(
      rows.map((row): WorksheetNamedFacts => ({
        id: row.id,
        name: row.name,
        disabled: row.disabledAt != null,
      })),
    );
  },

  async workTypes(db, workspaceId, filter) {
    const where =
      "ids" in filter
        ? live(workspaceId, filter.ids)
        : {
            workspaceId,
            deletedAt: null,
            departmentId: { in: [...filter.departmentIds] },
          };
    if (("ids" in filter ? filter.ids : filter.departmentIds).length === 0)
      return [];
    const rows = await db.constructionMastersWorkType.findMany({
      where,
      include: {
        materials: {
          where: { material: { deletedAt: null } },
          select: { materialId: true },
        },
      },
      orderBy: { name: "asc" },
    });
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      departmentId: row.departmentId,
      disabled: row.disabledAt != null,
      materialIds: row.materials.map((material) => material.materialId),
    }));
  },

  async materials(db, workspaceId, ids) {
    if (ids.length === 0) return new Map();
    const rows = await db.constructionMastersMaterial.findMany({
      where: live(workspaceId, ids),
      include: { uom: { select: { name: true } } },
    });
    return byId(
      rows.map((row) => ({
        id: row.id,
        name: row.name,
        unitName: row.uom.name,
        disabled: row.disabledAt != null,
      })),
    );
  },

  async units(db, workspaceId, ids) {
    if (ids?.length === 0) return [];
    const rows = await db.constructionMastersMeasurementUnit.findMany({
      where:
        ids == null ? { workspaceId, deletedAt: null } : live(workspaceId, ids),
      select: { id: true, name: true, disabledAt: true },
      orderBy: { name: "asc" },
    });
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      disabled: row.disabledAt != null,
    }));
  },

  async memberNames(db, workspaceId, userIds) {
    if (userIds.length === 0) return new Map<string, string>();
    const rows = await db.$queryRaw<
      { userId: string; name: string }[]
    >(Prisma.sql`
      SELECT DISTINCT ON (user_id) user_id AS "userId", name
      FROM construction_organization.team_members
      WHERE workspace_id = ${workspaceId}
        AND user_id = ANY(${[...userIds]}::text[])
      ORDER BY user_id, (deleted_at IS NULL) DESC, created_at DESC`);
    return new Map(rows.map((row) => [row.userId, row.name]));
  },
};

/**
 * A Project's attendance heads on a date by Labour Category skill (CM-0016
 * §6), through the shared reader the Project Dashboard also uses
 * (`attendanceHeadsBetween`). A labourer with no category has a null
 * skill, which the domain counts as unskilled.
 */
export const attendanceHeadcounts: AttendanceHeadcounts = {
  async onDate(db, workspaceId, projectId, date) {
    const rows = await attendanceHeadsBetween(db, workspaceId, projectId, {
      from: date,
      to: date,
    });
    return rows.map((row) => ({ skill: row.skill, heads: row.heads }));
  },
};
