import { Prisma } from "@repo/construction-db";

import { calendarDateToDb } from "@/src/shared-kernel/calendar-date";
import type {
  AttendanceHeadcounts,
  WorksheetContractorFacts,
  WorksheetDirectory,
  WorksheetNamedFacts,
} from "@/src/site-work/application/ports";

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
 * §6), read from the labour context's tables: labourers present or on a
 * half day (one head each, live rows) and vendor gangs (full-day plus
 * half-day heads on live sheets). A labourer with no category has a null
 * skill, which the domain counts as unskilled.
 */
export const attendanceHeadcounts: AttendanceHeadcounts = {
  async onDate(db, workspaceId, projectId, date) {
    const day = calendarDateToDb(date);
    const rows = await db.$queryRaw<
      { skill: "skilled" | "unskilled" | null; heads: number }[]
    >(Prisma.sql`
      SELECT skill, SUM(heads)::int AS heads FROM (
        SELECT lc.skill::text AS skill, COUNT(*)::int AS heads
        FROM construction_labour.labour_attendance a
        JOIN construction_labour.labours l ON l.id = a.labour_id
        LEFT JOIN construction_masters.labour_categories lc
          ON lc.id = l.labour_category_id
        WHERE a.workspace_id = ${workspaceId}
          AND a.project_id = ${projectId}::uuid
          AND a.attendance_date = ${day}::date
          AND a.deleted_at IS NULL
          AND a.status IN ('present', 'half_day')
        GROUP BY lc.skill
        UNION ALL
        SELECT lc.skill::text, SUM(line.full_day_count + line.half_day_count)::int
        FROM construction_labour.vendor_attendance va
        JOIN construction_labour.vendor_attendance_lines line
          ON line.attendance_id = va.id
        LEFT JOIN construction_masters.labour_categories lc
          ON lc.id = line.labour_category_id
        WHERE va.workspace_id = ${workspaceId}
          AND va.project_id = ${projectId}::uuid
          AND va.attendance_date = ${day}::date
          AND va.deleted_at IS NULL
        GROUP BY lc.skill
      ) AS heads
      GROUP BY skill`);
    return rows.map((row) => ({ skill: row.skill, heads: row.heads }));
  },
};
