import type { Prisma, PrismaClient } from "@repo/construction-db";

import {
  calendarDateFromDb,
  calendarDateToDb,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";
import type { ListCursor, NameCursor } from "@/src/shared-kernel/list-cursor";

import type {
  EmployeeListFilter,
  EmployeeListPage,
  EmployeeLookups,
  EmployeeOption,
  EmployeeQueries,
  EmployeeReadModel,
  ProjectEmployeeChoice,
  ProjectEmployeePage,
} from "../application/employee-ports";
import type { BloodGroup } from "../domain/employee";
import { workingHours, type Weekday } from "../domain/wages";
import { prismaLedger } from "./prisma-ledger";
import { companyToday } from "./prisma-labour-queries";

/** The Employee's Projects, oldest first (ADR CM-0033). */
const WITH_PROJECTS = {
  projects: {
    select: { projectId: true },
    orderBy: [{ since: "asc" }, { projectId: "asc" }],
  },
} as const satisfies Prisma.ConstructionLabourEmployeeInclude;

type Row = Prisma.ConstructionLabourEmployeeGetPayload<{
  include: typeof WITH_PROJECTS;
}>;

type Where = Prisma.ConstructionLabourEmployeeWhereInput;

/** The Role's name and its live Department, by Role id (ADR CM-0055 §2). */
type RoleLine = {
  id: string;
  name: string;
  department: { id: string; name: string } | null;
};

/** Shown for a Role whose row is gone. */
const DELETED_ROLE = "Deleted Role";

/** The Employee record's reads, with names of other contexts' records by id. */
export class PrismaEmployeeQueries implements EmployeeQueries {
  constructor(
    private readonly db: PrismaClient,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  /** The Roles of the Company among `ids`, deleted ones included. */
  private async roleLines(
    workspaceId: string,
    ids: readonly string[],
  ): Promise<Map<string, RoleLine>> {
    if (ids.length === 0) return new Map();
    const rows = await this.db.constructionOrganizationRole.findMany({
      where: { workspaceId, id: { in: [...new Set(ids)] } },
      select: {
        id: true,
        name: true,
        department: { select: { id: true, name: true, deletedAt: true } },
      },
    });
    return new Map(
      rows.map((row) => [
        row.id,
        {
          id: row.id,
          name: row.name,
          department:
            row.department != null && row.department.deletedAt == null
              ? { id: row.department.id, name: row.department.name }
              : null,
        },
      ]),
    );
  }

  private roleOf(roles: Map<string, RoleLine>, roleId: string): RoleLine {
    return (
      roles.get(roleId) ?? { id: roleId, name: DELETED_ROLE, department: null }
    );
  }

  private roleRef(
    roles: Map<string, RoleLine>,
    roleId: string,
  ): { id: string; name: string } {
    const { id, name } = this.roleOf(roles, roleId);
    return { id, name };
  }

  /** The list filters as Prisma conditions; a Department means its Roles. */
  private async whereOf(filter: EmployeeListFilter): Promise<Where[]> {
    const filters: Where[] = [
      { workspaceId: filter.workspaceId, deletedAt: null },
    ];
    if (filter.projectId != null)
      filters.push({ projects: { some: { projectId: filter.projectId } } });
    if (filter.active != null) filters.push({ isActive: filter.active });
    if (filter.labourCategoryId != null)
      filters.push({ labourCategoryId: filter.labourCategoryId });
    if (filter.roleId != null) filters.push({ roleId: filter.roleId });
    if (filter.departmentId != null) {
      const roles = await this.db.constructionOrganizationRole.findMany({
        where: {
          workspaceId: filter.workspaceId,
          departmentId: filter.departmentId,
        },
        select: { id: true },
      });
      filters.push({ roleId: { in: roles.map((role) => role.id) } });
    }
    const search = filter.search?.trim() ?? "";
    if (search.length > 0)
      filters.push({
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { employeeCode: { contains: search, mode: "insensitive" } },
          { fatherName: { contains: search, mode: "insensitive" } },
          { mobile: { contains: search.replace(/\s/g, "") } },
        ],
      });
    return filters;
  }

  /** Read models for rows: names (including deleted records), opening, balance. */
  private async readModels(
    workspaceId: string,
    rows: readonly Row[],
  ): Promise<EmployeeReadModel[]> {
    if (rows.length === 0) return [];
    const ids = rows.map((row) => row.id);
    const unique = (values: (string | null)[]) => [
      ...new Set(values.filter((value): value is string => value != null)),
    ];
    const today = await companyToday(this.db, workspaceId, this.clock());
    const projectIds = unique(
      rows.flatMap((row) => row.projects.map((project) => project.projectId)),
    );
    const [projects, categories, roles, managers, openings, balances] =
      await Promise.all([
        this.db.constructionProjectsProject.findMany({
          where: { workspaceId, id: { in: projectIds } },
          select: { id: true, name: true },
        }),
        this.db.constructionMastersLabourCategory.findMany({
          where: {
            workspaceId,
            id: { in: unique(rows.map((row) => row.labourCategoryId)) },
          },
          select: { id: true, name: true },
        }),
        this.roleLines(
          workspaceId,
          rows.map((row) => row.roleId),
        ),
        this.db.constructionLabourEmployee.findMany({
          where: {
            workspaceId,
            deletedAt: null,
            id: { in: unique(rows.map((row) => row.reportsToId)) },
          },
          select: { id: true, name: true },
        }),
        prismaLedger.openingBalances(this.db, workspaceId, "employee", ids),
        prismaLedger.balances(this.db, workspaceId, "employee", ids, today),
      ]);
    const byId = <T extends { id: string }>(items: T[]) =>
      new Map(items.map((item) => [item.id, item]));
    const projectNames = byId(projects);
    const categoryNames = byId(categories);
    const managerNames = byId(managers);
    const masked = (last4: string | null, length: number) =>
      last4 == null ? null : `${"X".repeat(length - 4)}${last4}`;
    return rows.map((row) => {
      const role = this.roleOf(roles, row.roleId);
      return {
        id: row.id,
        details: {
          name: row.name,
          employeeCode: row.employeeCode,
          roleId: row.roleId,
          fatherName: row.fatherName,
          dateOfBirth:
            row.dateOfBirth == null
              ? null
              : calendarDateFromDb(row.dateOfBirth),
          gender: row.gender,
          bloodGroup: row.bloodGroup as BloodGroup | null,
          joiningDate: calendarDateFromDb(row.joiningDate),
          mobile: row.mobile,
          email: row.email,
          address: row.address,
          emergencyContact: row.emergencyContact,
          qualification: row.qualification,
          experienceYears: row.experienceYears,
          specialisation: row.specialisation,
          wageType: row.wageType,
          wagePerDay: row.wagePerDay,
          wagePerMonth: row.wagePerMonth,
          overtimeWagePerHour: row.overtimeWagePerHour,
          workingHoursPerDay: workingHours(row.workingHoursPerDay.toString()),
          weeklyHolidays: row.weeklyHolidays as Weekday[],
          uanNumber: row.uanNumber,
          esicNumber: row.esicNumber,
          bankAccountHolder: row.bankAccountHolder,
          bankIfsc: row.bankIfsc,
          bankName: row.bankName,
          labourCategoryId: row.labourCategoryId,
          reportsToId: row.reportsToId,
        },
        aadhaarMasked: masked(row.aadhaarLast4, 12),
        panMasked: masked(row.panLast4, 10),
        bankAccountLast4: row.bankAccountLast4,
        role: { id: role.id, name: role.name },
        department: role.department,
        projects: row.projects.map(
          ({ projectId }) =>
            projectNames.get(projectId) ?? {
              id: projectId,
              name: "Deleted Project",
            },
        ),
        labourCategory:
          row.labourCategoryId == null
            ? null
            : (categoryNames.get(row.labourCategoryId) ?? null),
        reportsTo:
          row.reportsToId == null
            ? null
            : (managerNames.get(row.reportsToId) ?? null),
        teamMemberId: row.teamMemberId,
        isActive: row.isActive,
        photoKey: row.photoKey,
        openingBalance: openings.get(row.id) ?? 0,
        balance: balances.get(row.id) ?? 0,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      };
    });
  }

  async get(
    workspaceId: string,
    id: string,
  ): Promise<EmployeeReadModel | null> {
    const row = await this.db.constructionLabourEmployee.findFirst({
      where: { id, workspaceId, deletedAt: null },
      include: WITH_PROJECTS,
    });
    if (row == null) return null;
    const [model] = await this.readModels(workspaceId, [row]);
    return model ?? null;
  }

  async list(
    filter: EmployeeListFilter & {
      limit: number;
      after?: ListCursor;
      before?: ListCursor;
    },
  ): Promise<EmployeeListPage> {
    const filters = await this.whereOf(filter);
    // Newest first; `after` pages forward (older), `before` pages back.
    const backwards = filter.before != null;
    const cursor = filter.after ?? filter.before;
    const page = await this.db.constructionLabourEmployee.findMany({
      where: {
        AND:
          cursor == null
            ? filters
            : [
                ...filters,
                {
                  OR: backwards
                    ? [
                        { createdAt: { gt: cursor.createdAt } },
                        { createdAt: cursor.createdAt, id: { gt: cursor.id } },
                      ]
                    : [
                        { createdAt: { lt: cursor.createdAt } },
                        { createdAt: cursor.createdAt, id: { lt: cursor.id } },
                      ],
                },
              ],
      },
      orderBy: backwards
        ? [{ createdAt: "asc" }, { id: "asc" }]
        : [{ createdAt: "desc" }, { id: "desc" }],
      take: filter.limit + 1,
      include: WITH_PROJECTS,
    });
    const hasMore = page.length > filter.limit;
    const rows = page.slice(0, filter.limit);
    if (backwards) rows.reverse();
    const total = await this.db.constructionLabourEmployee.count({
      where: { AND: filters },
    });
    return {
      items: await this.readModels(filter.workspaceId, rows),
      total,
      hasMore,
    };
  }

  async all(filter: EmployeeListFilter): Promise<EmployeeReadModel[]> {
    const rows = await this.db.constructionLabourEmployee.findMany({
      where: { AND: await this.whereOf(filter) },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take: 10_000,
      include: WITH_PROJECTS,
    });
    return this.readModels(filter.workspaceId, rows);
  }

  private async categoryNames(
    workspaceId: string,
    ids: readonly (string | null)[],
  ): Promise<Map<string, { id: string; name: string }>> {
    const wanted = [...new Set(ids.filter((id): id is string => id != null))];
    if (wanted.length === 0) return new Map();
    const rows = await this.db.constructionMastersLabourCategory.findMany({
      where: { workspaceId, id: { in: wanted } },
      select: { id: true, name: true },
    });
    return new Map(rows.map((row) => [row.id, row]));
  }

  async onProject(filter: {
    workspaceId: string;
    projectId: string;
    search?: string;
    limit: number;
    after?: NameCursor;
    before?: NameCursor;
  }): Promise<ProjectEmployeePage> {
    const filters = await this.whereOf({
      workspaceId: filter.workspaceId,
      projectId: filter.projectId,
      ...(filter.search == null ? {} : { search: filter.search }),
    });
    // By name; `after` pages forward, `before` pages back.
    const backwards = filter.before != null;
    const cursor = filter.after ?? filter.before;
    const page = await this.db.constructionLabourEmployee.findMany({
      where: {
        AND:
          cursor == null
            ? filters
            : [
                ...filters,
                {
                  OR: backwards
                    ? [
                        { name: { lt: cursor.name } },
                        { name: cursor.name, id: { lt: cursor.id } },
                      ]
                    : [
                        { name: { gt: cursor.name } },
                        { name: cursor.name, id: { gt: cursor.id } },
                      ],
                },
              ],
      },
      orderBy: backwards
        ? [{ name: "desc" }, { id: "desc" }]
        : [{ name: "asc" }, { id: "asc" }],
      take: filter.limit + 1,
      select: {
        id: true,
        name: true,
        employeeCode: true,
        roleId: true,
        labourCategoryId: true,
        isActive: true,
        projects: {
          where: { projectId: filter.projectId },
          select: { since: true },
        },
      },
    });
    const hasMore = page.length > filter.limit;
    const rows = page.slice(0, filter.limit);
    if (backwards) rows.reverse();
    const [total, categories, roles] = await Promise.all([
      this.db.constructionLabourEmployee.count({ where: { AND: filters } }),
      this.categoryNames(
        filter.workspaceId,
        rows.map((row) => row.labourCategoryId),
      ),
      this.roleLines(
        filter.workspaceId,
        rows.map((row) => row.roleId),
      ),
    ]);
    return {
      items: rows.map((row) => ({
        id: row.id,
        name: row.name,
        employeeCode: row.employeeCode,
        role: this.roleRef(roles, row.roleId),
        labourCategory:
          row.labourCategoryId == null
            ? null
            : (categories.get(row.labourCategoryId) ?? null),
        since: calendarDateFromDb(row.projects[0]?.since ?? new Date(0)),
        isActive: row.isActive,
      })),
      total,
      hasMore,
    };
  }

  async countOnProject(
    workspaceId: string,
    projectId: string,
  ): Promise<number> {
    return this.db.constructionLabourEmployee.count({
      where: { AND: await this.whereOf({ workspaceId, projectId }) },
    });
  }

  async addableToProject(input: {
    workspaceId: string;
    projectId: string;
    search?: string;
    limit: number;
  }): Promise<{ items: ProjectEmployeeChoice[]; hasMore: boolean }> {
    const rows = await this.db.constructionLabourEmployee.findMany({
      where: {
        AND: [
          ...(await this.whereOf({
            workspaceId: input.workspaceId,
            active: true,
            ...(input.search == null ? {} : { search: input.search }),
          })),
          { projects: { none: { projectId: input.projectId } } },
        ],
      },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take: input.limit + 1,
      select: {
        id: true,
        name: true,
        employeeCode: true,
        roleId: true,
        labourCategoryId: true,
        joiningDate: true,
      },
    });
    const kept = rows.slice(0, input.limit);
    const [categories, roles] = await Promise.all([
      this.categoryNames(
        input.workspaceId,
        kept.map((row) => row.labourCategoryId),
      ),
      this.roleLines(
        input.workspaceId,
        kept.map((row) => row.roleId),
      ),
    ]);
    return {
      items: kept.map((row) => ({
        id: row.id,
        name: row.name,
        employeeCode: row.employeeCode,
        role: this.roleRef(roles, row.roleId),
        labourCategory:
          row.labourCategoryId == null
            ? null
            : (categories.get(row.labourCategoryId) ?? null),
        joiningDate: calendarDateFromDb(row.joiningDate),
      })),
      hasMore: rows.length > input.limit,
    };
  }

  async options(
    workspaceId: string,
    projectId: string,
    date: CalendarDate,
  ): Promise<EmployeeOption[]> {
    const day = calendarDateToDb(date);
    // Active Employees whose history puts them on the Project that day: the
    // latest row on or before it that names the Project moves them onto it
    // (ADR CM-0033). Their other Projects do not matter.
    const ids = await this.db.$queryRaw<{ id: string }[]>`
      SELECT l.id::text AS id
      FROM construction_labour.employees l
      WHERE l.workspace_id = ${workspaceId}
        AND l.deleted_at IS NULL
        AND l.is_active
        AND l.joining_date <= ${day}
        AND (
          SELECT t.to_project_id IS NOT DISTINCT FROM ${projectId}::uuid
          FROM construction_labour.employee_transfers t
          WHERE t.employee_id = l.id
            AND t.transfer_date <= ${day}
            AND (t.to_project_id = ${projectId}::uuid
              OR t.from_project_id = ${projectId}::uuid)
          ORDER BY t.transfer_date DESC, t.created_at DESC, t.id DESC
          LIMIT 1
        )
    `;
    if (ids.length === 0) return [];
    const rows = await this.db.constructionLabourEmployee.findMany({
      where: { id: { in: ids.map((row) => row.id) } },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      employeeCode: row.employeeCode,
      labourCategoryId: row.labourCategoryId,
      wageType: row.wageType,
      weeklyHolidays: row.weeklyHolidays,
      workingHoursPerDay: workingHours(row.workingHoursPerDay.toString()),
      wagePerDay: row.wagePerDay,
      wagePerMonth: row.wagePerMonth,
      overtimeWagePerHour: row.overtimeWagePerHour,
    }));
  }

  /** Every live Project, Labour Category, Role and Department (import, template). */
  async lookups(workspaceId: string) {
    const [projects, labourCategories, roles, departments] = await Promise.all([
      this.db.constructionProjectsProject.findMany({
        where: { workspaceId, deletedAt: null },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      this.db.constructionMastersLabourCategory.findMany({
        where: { workspaceId, deletedAt: null },
        select: { id: true, name: true, disabledAt: true },
        orderBy: { name: "asc" },
      }),
      this.db.constructionOrganizationRole.findMany({
        where: { workspaceId, deletedAt: null },
        select: {
          id: true,
          name: true,
          isSeed: true,
          department: { select: { id: true, name: true, deletedAt: true } },
        },
        orderBy: { name: "asc" },
      }),
      this.db.constructionOrganizationDepartment.findMany({
        where: { workspaceId, deletedAt: null },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
    ]);
    return {
      projects,
      roles: roles.map((row) => ({
        id: row.id,
        name: row.name,
        isSeed: row.isSeed,
        department:
          row.department != null && row.department.deletedAt == null
            ? { id: row.department.id, name: row.department.name }
            : null,
      })),
      departments,
      labourCategories: labourCategories.map((row) => ({
        id: row.id,
        name: row.name,
        disabled: row.disabledAt != null,
      })),
    };
  }
}

/** `EmployeeLookups` over the same reads. */
export function prismaEmployeeLookups(
  queries: PrismaEmployeeQueries,
): EmployeeLookups {
  return { all: (workspaceId) => queries.lookups(workspaceId) };
}
